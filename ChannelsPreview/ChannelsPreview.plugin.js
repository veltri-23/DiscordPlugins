/**
 * @name ChannelsPreview
 * @author arg0NNY
 * @authorLink https://github.com/okdevme/DiscordPlugins
 * @invite M8DBtcZjXD
 * @donate https://donationalerts.com/r/arg0nny
 * @version 2.1.16
 * @description Allows you to view recent messages in channels without switching to it.
 * @website https://github.com/okdevme/DiscordPlugins/tree/master/ChannelsPreview
 * @source https://raw.githubusercontent.com/okdevme/DiscordPlugins/master/ChannelsPreview/ChannelsPreview.plugin.js
 * @runAt idle
 */

/* ### CONFIG START ### */
const config = {
  info: {
    name: 'ChannelsPreview',
    version: '2.1.16',
    description: 'Allows you to view recent messages in channels without switching to it.'
  },
  changelog: [
    {
      type: 'fixed',
      title: 'Fixes',
      items: [
        'Updated author GitHub username.'
      ]
    }
  ]
}
/* ### CONFIG END ### */

const {
  DOM,
  Webpack,
  Patcher,
  React,
  Utils,
  Data,
  UI,
  Components
} = new BdApi(config.info.name)

const cpDebug = (msg) => {
  try {
    const line = new Date().toISOString() + ' ' + msg
    try { window.__cpLog = (window.__cpLog || '') + line + '\n' } catch (e) { }
    try { require('fs').appendFileSync('C:/Users/mrvel/AppData/Roaming/betterdiscord/plugins/cp-debug.log', line + '\n') } catch (e) { }
  } catch (e) { }
}

const safeAfter = ([module, key], callback) => {
  if (!module || typeof key !== 'string' || typeof module[key] !== 'function') {
    cpDebug('patch skipped: ' + (module ? ('key=' + key) : 'module missing'))
    return
  }
  try {
    Patcher.after(module, key, callback)
  } catch (e) {
    cpDebug('patch FAILED key=' + key + ': ' + String(e && e.message || e).slice(0, 300))
  }
}

const safeBefore = ([module, key], callback) => {
  if (!module || typeof key !== 'string' || typeof module[key] !== 'function') {
    cpDebug('before skipped: ' + (module ? ('key=' + key) : 'module missing'))
    return
  }
  Patcher.before(module, key, callback)
}

const resolvePair = (filter, rawModule, strings) => {
  const matchStr = (v) => {
    const s = String(v)
    let n = 0
    for (const str of strings || []) if (s.includes(str)) n++
    return n
  }
  const tryRaw = (raw) => {
    if (!raw || !raw.exports) return null
    let best = null
    let bestScore = 0
    for (const key of Object.keys(raw.exports)) {
      const v = raw.exports[key]
      if (typeof v !== 'function') continue
      const o = v.__originalFunction || v
      if (filter(v) || filter(v.type) || filter(o) || filter(o.type)) return [raw.exports, key]
      const sc = Math.max(matchStr(v), matchStr(v && v.type), matchStr(o), matchStr(o && o.type))
      if (sc > bestScore) { bestScore = sc; best = [raw.exports, key] }
    }
    if (!best) {
      let sizeBest = null
      let sizeScore = 0
      for (const key of Object.keys(raw.exports)) {
        const v = raw.exports[key]
        const len = String(v.__originalFunction || v).length
        if (len > sizeScore) { sizeScore = len; sizeBest = [raw.exports, key] }
      }
      if (sizeBest) { cpDebug('size-based pick: key=' + sizeBest[1] + ' len=' + sizeScore); return sizeBest }
    } else {
      cpDebug('best-effort pair: key=' + best[1] + ' score=' + bestScore)
    }
    return best
  }
  if (rawModule) {
    const p = tryRaw(rawModule)
    if (p) return p
    cpDebug('raw exports no component match')
  }
  const g = tryRaw(Webpack.getModule(filter, { raw: true }))
  if (g) return g
  cpDebug('pair unresolved')
  return [undefined, undefined]
}

const { Filters } = Webpack
const { ErrorBoundary } = Components

const MessageActions = Webpack.getByKeys('jumpToMessage', '_sendMessage')
const MessageStore = Webpack.getStore('MessageStore')
const GuildChannelStore = Webpack.getStore('ChannelStore')
const Flux = Webpack.getByKeys('Store', 'connectStores')
const Dispatcher = Webpack.getModule(Filters.byKeys('dispatch', 'subscribe'), { searchExports: true })
const ChannelTypes = Webpack.getModule(Filters.byKeys('GUILD_TEXT'), { searchExports: true })

const findInReactTree = (tree, searchFilter) => Utils.findInTree(tree, searchFilter, { walkable: ['props', 'children', 'child', 'sibling'] })

const Selectors = {
  Messages: Webpack.getByKeys('message', 'cozyMessage'),
  MessageDividers: Webpack.getByKeys('divider', 'unreadPill'),
  Popout: Webpack.getByKeys('messagesPopoutWrap'),
  Channel: Webpack.getByKeys('channel', 'interactive'),
  Typing: Webpack.getByKeys('typing', 'ellipsis'),
  ChatLayout: Webpack.getByKeys('sidebar', 'guilds'),
  AppView: Webpack.getByKeys('base', 'content'),
  Chat: Webpack.getByKeys('messagesWrapper', 'scrollerContent')
}

let settings = {}
const SUPPORTED_CHANNEL_TYPES = [
  ChannelTypes.GUILD_TEXT,
  ChannelTypes.GUILD_ANNOUNCEMENT,
  ChannelTypes.DM,
  ChannelTypes.GROUP_DM,
  ChannelTypes.PUBLIC_THREAD,
  ChannelTypes.PRIVATE_THREAD,
  ChannelTypes.GUILD_VOICE,
  ChannelTypes.GUILD_STAGE_VOICE
]

const PinToBottomScrollerAuto = Webpack.getModule(Filters.bySource('useImperativeHandle', 'getScrollerState', 'isScrolling'), {
  declarationFilter: m => Filters.byStrings('useImperativeHandle', 'getScrollerState', 'isScrolling')(m?.render)
})
const Popout = Webpack.getModule(m => Filters.byKeys('Animation')(m) && Filters.byStrings('renderPopout')(m?.prototype?.render), { searchExports: true })
const FieldSet = Webpack.getModule(Filters.byStrings('"fieldset"', '"legend"'), { searchExports: true })
const { RadioGroup } = Webpack.getMangled(Filters.bySource('"radiogroup"', 'getFocusableElements'), {
  RadioGroup: Filters.byStrings('label', 'description')
})
const Slider = Webpack.getModule(m => Filters.byKeys('stickToMarkers', 'initialValue')(m?.defaultProps), { searchExports: true })
const Switch = Webpack.getByStrings('checked', '.controlId')
const Stack = Webpack.getModule(m => Filters.byStrings('data-direction', 'data-justify')(m?.render), { searchExports: true })
const Divider = Webpack.getModule(Filters.byStrings('),style:{marginTop:'), { searchExports: true })
const Field = Webpack.getModule(Filters.byStrings('helperTextId', 'errorMessage'), { searchExports: true })
const { Checkbox, CheckboxTypes } = Webpack.getMangled(Filters.bySource('Checkbox:', 'is not a valid hex color'), {
  Checkbox: Filters.byStrings('innerClassName'),
  CheckboxTypes: Filters.byKeys('INVERTED')
})

const ChannelItemModule = Webpack.getModule(Filters.bySource('shouldIndicateNewChannel', 'MANAGE_CHANNELS'), { raw: true })
const ChannelItem = resolvePair(Filters.byStrings('shouldIndicateNewChannel', 'MANAGE_CHANNELS'), ChannelItemModule, ['shouldIndicateNewChannel', 'MANAGE_CHANNELS'])
const VoiceChannelItem = resolvePair(Filters.byStrings('PLAYING', 'MANAGE_CHANNELS'), ChannelItemModule, ['PLAYING', 'MANAGE_CHANNELS'])
const StageVoiceChannelItem = resolvePair(Filters.byStrings('getStageInstanceByChannel', 'MANAGE_CHANNELS'), ChannelItemModule, ['getStageInstanceByChannel', 'MANAGE_CHANNELS'])
const DMChannelItem = resolvePair(Filters.byStrings('getRecipientId', 'getTypingUsers'), null, ['getRecipientId', 'getTypingUsers'])
const ChannelLink = resolvePair(Filters.byStrings('hasActiveThreads', 'isGuildVocal'), null, ['hasActiveThreads', 'isGuildVocal'])
const ThreadChannelItem = Webpack.getModule(Filters.bySource('thread', 'getVoiceStatesForChannel'), {
  declarationFilter: m => Filters.byStrings('thread', 'getVoiceStatesForChannel')(m?.type)
})
const AppearanceSettingsStore = Webpack.getByKeys('fontSize', 'fontScale')
const MessageComponent = Webpack.getModule(Filters.bySource('must not be a thread starter message'), {
  declarationFilter: m => Filters.byStrings('must not be a thread starter message')(m?.type)
})
const ThreadStarterMessage = Webpack.getModule(Filters.bySource('must be a thread starter message'), {
  declarationFilter: Filters.byStrings('must be a thread starter message')
})
const EmptyMessage = Webpack.getModule(Filters.bySource('canManageRoles', 'IS_JOIN_REQUEST_INTERVIEW_CHANNEL'), {
  declarationFilter: Filters.byStrings('canManageRoles', 'IS_JOIN_REQUEST_INTERVIEW_CHANNEL')
})
const FluxTypingUsers = Webpack.getByStrings('typingUsers', 'isThreadCreation')
const useStateFromStores = Webpack.getModule(Filters.byStrings('useStateFromStores'), { searchExports: true })
const AppView = resolvePair(Filters.byStrings('CHANNEL_THREAD_VIEW', 'GUILD_DISCOVERY'), Webpack.getModule(Filters.bySource('CHANNEL_THREAD_VIEW', 'GUILD_DISCOVERY', 'data-fullscreen'), { raw: true }), ['CHANNEL_THREAD_VIEW', 'GUILD_DISCOVERY'])
const ChannelChat = Webpack.getModule(m => Filters.byStrings('channelStream', 'oldestUnreadMessageId')(m?.type))
const ChannelStreamItemTypes = Webpack.getModule(Filters.byKeys('MESSAGE', 'DIVIDER'), { searchExports: true })
const MessageDivider = Webpack.getModule(m => Filters.byStrings('"separator"', 'isBeforeGroup')(m?.type?.render))
const Attachment = resolvePair(Filters.byStrings('getObscureReason', 'obscurityControlClassName'), null, ['getObscureReason', 'obscurityControlClassName'])
const Embed = Webpack.getByPrototypeKeys('renderAuthor', 'renderMedia')
const FocusRing = Webpack.getModule(Filters.bySource('focusProps', '"li"'), { declarationFilter: m => Filters.byStrings('focusProps', '"li"')(m?.render) })

function forceAppUpdate () {
  Dispatcher.dispatch({ type: 'DOMAIN_MIGRATION_START' })
  requestIdleCallback(() => Dispatcher.dispatch({ type: 'DOMAIN_MIGRATION_SKIP' }))
}

const ReducerStore = (() => {
  let n = 0

  function handleForceUpdate () {
    n += 1
  }

  return new class ReducerStore extends Flux.Store {
    getValue () {
      return n
    }
  }(Dispatcher, {
    CP__FORCE_UPDATE: handleForceUpdate
  })
})()

function useUpdater () {
  return useStateFromStores([ReducerStore], () => ReducerStore.getValue())
}

const ShownPreviewsStore = (() => {
  const shouldShow = new Set()
  const shown = new Set()
  const scrollerRefs = new Map()

  function handlePreviewShouldShow ({ channelId }) {
    shouldShow.add(channelId)
  }

  function handlePreviewShouldHide ({ channelId }) {
    shouldShow.delete(channelId)
  }

  function handlePreviewOpened ({ channelId, scrollerRef }) {
    shown.add(channelId)
    if (scrollerRef) scrollerRefs.set(channelId, scrollerRef)
  }

  function handlePreviewClosed ({ channelId }) {
    shown.delete(channelId)
    scrollerRefs.delete(channelId)
  }

  return new class OpenedPreviewsStore extends Flux.Store {
    shouldShow (channelId) {
      return shouldShow.has(channelId)
    }

    isShown (channelId) {
      return shown.has(channelId)
    }

    hasAnyShown () {
      return shown.size > 0
    }

    getScrollerRef (channelId) {
      return scrollerRefs.get(channelId)
    }
  }(Dispatcher, {
    CP__PREVIEW_SHOULD_SHOW: handlePreviewShouldShow,
    CP__PREVIEW_SHOULD_HIDE: handlePreviewShouldHide,
    CP__PREVIEW_SHOWN: handlePreviewOpened,
    CP__PREVIEW_HIDDEN: handlePreviewClosed
  })
})()

const KeyboardStore = (() => {
  let isShiftKeyPressed = false

  function handleKeyDown ({ event }) {
    if (event.code === 'ShiftLeft') isShiftKeyPressed = true
  }

  function handleKeyUp ({ event }) {
    if (event.code === 'ShiftLeft') isShiftKeyPressed = false
  }

  return new class KeyboardStore extends Flux.Store {
    isShiftKeyPressed () {
      return isShiftKeyPressed
    }
  }(Dispatcher, {
    CP__KEY_DOWN: handleKeyDown,
    CP__KEY_UP: handleKeyUp
  })
})()

function useIsShiftKeyPressed () {
  return useStateFromStores([KeyboardStore], () => KeyboardStore.isShiftKeyPressed())
}

function isGroupStarter (channelStreamItem) {
  return channelStreamItem?.type === ChannelStreamItemTypes.MESSAGE
    && channelStreamItem.content.id === channelStreamItem.groupId
}

const DMChannelContext = React.createContext({ channel: null, selected: false })
const PreviewContext = React.createContext({ channel: null })

function useGenerateChannelStream({ channel, messageCountLimit }) {
  const value = ChannelChat.type({ channel })
  const { channelStream } = findInReactTree(value, m => m?.channelStream)
  if (messageCountLimit == null) return channelStream

  // Limit the message stream by message count while keeping the dividers
  const slicedStream = []
  let count = 0
  for (const item of channelStream.toReversed()) {
    if (count >= messageCountLimit) {
      if (item.type !== ChannelStreamItemTypes.DIVIDER)
        continue

      slicedStream.unshift(item)
      break
    }

    slicedStream.unshift(item)
    count += [ChannelStreamItemTypes.MESSAGE, ChannelStreamItemTypes.THREAD_STARTER_MESSAGE].includes(item.type)
  }

  return slicedStream
}

function PreviewDialog ({ channel, messages }) {
  const scrollerRef = React.useRef(null)

  React.useEffect(() => {
    Dispatcher.dispatch({ type: 'CP__PREVIEW_SHOWN', channelId: channel.id, scrollerRef })
    return () => Dispatcher.dispatch({ type: 'CP__PREVIEW_HIDDEN', channelId: channel.id })
  }, [])

  const messageCountLimit = settings.appearance.messagesCount
  const messageGroupSpacing = settings.appearance.groupSpacingSync
    ? (AppearanceSettingsStore.messageGroupSpacing ?? 16)
    : settings.appearance.groupSpacing

  const channelStream = [
    !messages.hasMoreBefore && messages.length <= messageCountLimit
      ? { type: 'EMPTY_MESSAGE' }
      : { type: ChannelStreamItemTypes.DIVIDER, content: `Displaying last ${messageCountLimit} messages`, cut: true }
  ].concat(
    useGenerateChannelStream({
      channel,
      messageCountLimit
    })
  )

  const channelStreamMarkup = channelStream
    .map((item, index) => {
      switch (item.type) {
        case 'EMPTY_MESSAGE':
          return React.createElement(EmptyMessage, { channel })
        case ChannelStreamItemTypes.DIVIDER:
          return React.createElement(MessageDivider, {
            className: item.cut ? 'CP__divider-cut' : '',
            isUnread: !!item.unreadId,
            isBeforeGroup: !item.content && isGroupStarter(channelStream[index + 1]),
            children: item.content
          })
        case ChannelStreamItemTypes.MESSAGE:
        case ChannelStreamItemTypes.THREAD_STARTER_MESSAGE:
          return React.createElement(
            item.type === ChannelStreamItemTypes.THREAD_STARTER_MESSAGE ? ThreadStarterMessage : MessageComponent,
            {
              channel,
              message: item.content,
              groupId: item.groupId,
              id: `chat-messages-${item.content.id}`,
              compact: settings.appearance.displayMode === 'compact'
            }
          )
      }
    })

  return React.createElement(
    'div',
    {
      className: `CP__popout group-spacing-${messageGroupSpacing} ${Selectors.Popout.messagesPopoutWrap}`,
      style: {
        height: (settings.appearance.popoutHeight ?? 30) + 'vh'
      }
    },
    React.createElement(PreviewContext.Provider, {
      value: { channel },
      children: React.createElement(PinToBottomScrollerAuto, {
        ref: scrollerRef,
        className: 'CP__scroller',
        contentClassName: Selectors.Chat.scrollerContent,
        onResize: () => {}, // Causes error if not provided
        onScroll: () => {}, // And this one is just to be safe :)
        children: React.createElement('div', {
          className: 'CP__container',
          children: [
            ...channelStreamMarkup,
            settings.appearance.typingUsers !== false && React.createElement(FluxTypingUsers, { channel })
          ]
        })
      })
    })
  )
}

function HoverPreviewDialog ({ channel }) {
  const messages = useStateFromStores([MessageStore], () => MessageStore.getMessages(channel.id))
  const isFetchable = messages.length < settings.appearance.messagesCount && (messages.hasMoreBefore || messages.hasMoreAfter)
  const scrollerRef = React.useRef(null)
  const pinnedRef = React.useRef(true)

  React.useEffect(() => {
    if (isFetchable)
      MessageActions.fetchMessages({ channelId: channel.id, limit: settings.appearance.messagesCount })
  }, [isFetchable])

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 60) pinnedRef.current = false
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const pin = () => { if (pinnedRef.current) el.scrollTop = el.scrollHeight }
    pin()
    const t = setTimeout(pin, 500)
    return () => clearTimeout(t)
  }, [messages])

  const messageCountLimit = settings.appearance.messagesCount
  const messageGroupSpacing = settings.appearance.groupSpacingSync
    ? (AppearanceSettingsStore.messageGroupSpacing ?? 16)
    : settings.appearance.groupSpacing

  const channelStream = [
    !messages.hasMoreBefore && messages.length <= messageCountLimit
      ? { type: 'EMPTY_MESSAGE' }
      : { type: ChannelStreamItemTypes.DIVIDER, content: `Displaying last ${messageCountLimit} messages`, cut: true }
  ].concat(
    useGenerateChannelStream({
      channel,
      messageCountLimit
    })
  )

  const channelStreamMarkup = channelStream
    .map((item, index) => {
      switch (item.type) {
        case 'EMPTY_MESSAGE':
          return React.createElement(EmptyMessage, { channel })
        case ChannelStreamItemTypes.DIVIDER:
          return React.createElement(MessageDivider, {
            className: item.cut ? 'CP__divider-cut' : '',
            isUnread: !!item.unreadId,
            isBeforeGroup: !item.content && isGroupStarter(channelStream[index + 1]),
            children: item.content
          })
        case ChannelStreamItemTypes.MESSAGE:
        case ChannelStreamItemTypes.THREAD_STARTER_MESSAGE:
          return React.createElement(
            item.type === ChannelStreamItemTypes.THREAD_STARTER_MESSAGE ? ThreadStarterMessage : MessageComponent,
            {
              channel,
              message: item.content,
              groupId: item.groupId,
              id: `chat-messages-${item.content.id}`,
              compact: settings.appearance.displayMode === 'compact'
            }
          )
        default:
          return null
      }
    })

  return React.createElement(
    'div',
    {
      className: `CP__popout group-spacing-${messageGroupSpacing} ${Selectors.Popout.messagesPopoutWrap}`,
      style: {
        height: (settings.appearance.popoutHeight ?? 30) + 'vh',
        pointerEvents: 'auto'
      }
    },
    React.createElement(PreviewContext.Provider, {
      value: { channel },
      children: React.createElement(
        'div',
        {
          ref: scrollerRef,
          className: 'CP__scroller',
          style: { overflowY: 'scroll', height: '100%', display: 'block', pointerEvents: 'auto' }
        },
        React.createElement('div', {
          className: 'CP__container',
          children: channelStreamMarkup
        })
      )
    })
  )
}

function ChannelPopout ({ channel, selected, messages, children, shouldShow: _shouldShow = false, ...props }) {
  const isShiftKeyPressed = useIsShiftKeyPressed()

  const shouldShow = _shouldShow && !selected
    && (settings.trigger.displayOn !== 'shift-hover' || isShiftKeyPressed)
    && (settings.behaviour.nsfw !== 'hide' || !channel.nsfw)
  const isFetchable = messages.length < settings.appearance.messagesCount && (messages.hasMoreBefore || messages.hasMoreAfter)

  React.useEffect(() => {
    if (shouldShow && isFetchable)
      MessageActions.fetchMessages({ channelId: channel.id, limit: settings.appearance.messagesCount })
  }, [shouldShow, isFetchable])
  React.useEffect(
    () => () => Dispatcher.dispatch({ type: 'CP__PREVIEW_SHOULD_HIDE', channelId: channel.id }),
    [channel.id]
  )

  return React.createElement(Popout, {
    position: 'right',
    align: 'center',
    renderPopout: () => React.createElement(ErrorBoundary, {
      name: 'PreviewDialog',
      children: React.createElement(PreviewDialog, { channel, messages })
    }),
    children,
    shouldShow: shouldShow && !isFetchable,
    spacing: 16,
    disablePointerEvents: true,
    ...props
  })
}

function ChannelPopoutBackdrop () {
  const shouldShow = useStateFromStores([ShownPreviewsStore], () => ShownPreviewsStore.hasAnyShown())

  return shouldShow ? React.createElement('div', {
    className: 'CP__backdrop',
    style: { opacity: settings.appearance.darkenLevel }
  }) : null
}

module.exports = class ChannelsPreview {
  start () {
    try {
      cpDebug('start() called')
      this.injectCSS()

      this.attachHoverPreview()
      this.attachKeyboardEvents()

      forceAppUpdate()
      cpDebug('start() complete')
    } catch (e) {
      cpDebug('start() ERROR: ' + String(e && e.stack || e).slice(0, 500))
    }
  }

  showPopout (channel) {
    cpDebug('showPopout id=' + channel.id + ' type=' + channel.type + ' supported=' + SUPPORTED_CHANNEL_TYPES.includes(channel.type))
    if (!SUPPORTED_CHANNEL_TYPES.includes(channel.type)) return

    Dispatcher.dispatch({ type: 'CP__PREVIEW_SHOULD_SHOW', channelId: channel.id })
  }

  closePopout (channelId) {
    Dispatcher.dispatch({ type: 'CP__PREVIEW_SHOULD_HIDE', channelId })
  }

  attachHoverPreview () {
    this.hoverPreview = {
      hoverTimer: null,
      closeTimer: null,
      channelId: null,
      currentLink: null,
      root: null,
      rootEl: null
    }

    this.onChannelMouseOver = (e) => {
      const target = e.target
      if (!target || typeof target.closest !== 'function') return
      const linkEl = target.closest('a[href^="/channels/"], [data-list-item-id^="channels___"]')
      const inPortal = this.hoverPreview.rootEl && this.hoverPreview.rootEl.contains(target)
      if (linkEl || inPortal) {
        clearTimeout(this.hoverPreview.closeTimer)
      }
      if (!linkEl) return
      if (this.hoverPreview.currentLink === linkEl) return
      this.hoverPreview.currentLink = linkEl
      let id = null
      if (linkEl.tagName === 'A') {
        const m = linkEl.getAttribute('href').match(/\/channels\/(\d+)\/(\d+)$/)
        if (m) id = m[2]
      } else {
        const attr = linkEl.getAttribute('data-list-item-id')
        if (attr && attr.indexOf('___') > -1) id = attr.slice(attr.indexOf('___') + 3)
      }
      if (!id) return
      const channel = GuildChannelStore && GuildChannelStore.getChannel(id)
      if (!channel || !SUPPORTED_CHANNEL_TYPES.includes(channel.type)) return
      clearTimeout(this.hoverPreview.hoverTimer)
      this.hoverPreview.hoverTimer = setTimeout(
        () => this.openPreview(channel, linkEl),
        settings.trigger.hoverDelay * 1000
      )
    }

    this.onChannelMouseOut = (e) => {
      const target = e.target
      const to = e.relatedTarget
      const inPopout = (n) => n && this.hoverPreview.rootEl && this.hoverPreview.rootEl.contains(n)
      const inLink = (n) => n && this.hoverPreview.currentLink && this.hoverPreview.currentLink.contains(n)
      if (!target || typeof target.closest !== 'function') return
      const linkEl = target.closest('a[href^="/channels/"], [data-list-item-id^="channels___"]')
      if (linkEl) {
        if (this.hoverPreview.currentLink !== linkEl) return
        if (to && (inPopout(to) || inLink(to))) return
        this.hoverPreview.currentLink = null
        clearTimeout(this.hoverPreview.hoverTimer)
        this.hoverPreview.hoverTimer = null
        clearTimeout(this.hoverPreview.closeTimer)
        this.hoverPreview.closeTimer = setTimeout(() => this.closePreview(), 250)
        return
      }
      if (this.hoverPreview.rootEl && this.hoverPreview.rootEl.contains(target)) {
        if (to && (inPopout(to) || inLink(to))) return
        this.hoverPreview.currentLink = null
        clearTimeout(this.hoverPreview.hoverTimer)
        this.hoverPreview.hoverTimer = null
        clearTimeout(this.hoverPreview.closeTimer)
        this.hoverPreview.closeTimer = setTimeout(() => this.closePreview(), 250)
      }
    }

    document.addEventListener('mouseover', this.onChannelMouseOver, true)
    document.addEventListener('mouseout', this.onChannelMouseOut, true)
    cpDebug('hover listener attached')
  }

  openPreview (channel, anchor) {
    try {
      this.closePreview()

      const rootEl = document.createElement('div')
      rootEl.className = 'CP__portal'
      document.body.appendChild(rootEl)
      const rect = anchor.getBoundingClientRect()
      rootEl.style.cssText = `position: fixed; left: ${Math.round(rect.right)}px; top: ${Math.max(8, rect.top - rect.height / 2)}px; z-index: 10000;`

      const root = BdApi.ReactDOM.createRoot(rootEl, {
        onUncaughtError: (e) => { cpDebug('render error: ' + String(e && e.stack || e).slice(0, 500)) },
        onRecoverableError: (e) => { cpDebug('recoverable error: ' + String(e && e.message || e).slice(0, 300)) }
      })
      root.render(React.createElement(HoverPreviewDialog, { channel }))
      this.hoverPreview.root = root
      this.hoverPreview.rootEl = rootEl
    } catch (e) {
      cpDebug('openPreview ERROR: ' + String(e && e.message || e).slice(0, 300))
      this.closePreview()
    }
  }

  closePreview () {
    clearTimeout(this.hoverPreview.closeTimer)
    this.hoverPreview.closeTimer = null
    if (this.hoverPreview && this.hoverPreview.root) {
      try { this.hoverPreview.root.unmount() } catch (e) { }
      this.hoverPreview.root = null
    }
    if (this.hoverPreview && this.hoverPreview.rootEl) {
      try { this.hoverPreview.rootEl.remove() } catch (e) { }
      this.hoverPreview.rootEl = null
    }
  }

  patchChannelItem () {
    safeAfter(ChannelItem, (self, [{ channel, selected }], value) => {
      useUpdater()
      const messages = useStateFromStores([MessageStore], () => MessageStore.getMessages(channel.id))
      const shouldShow = useStateFromStores([ShownPreviewsStore], () => ShownPreviewsStore.shouldShow(channel.id))

      const href = `/channels/${channel.guild_id}/${channel.id}`
      const linkWrapper = findInReactTree(value, m => m?.children?.props?.href === href)
      if (!linkWrapper) {
        cpDebug('channel link NOT FOUND id=' + channel.id)
        return
      }
      cpDebug('channel link FOUND id=' + channel.id)

      this.patchLink({
        link: linkWrapper.children,
        channel,
        selected
      })

      const { children } = linkWrapper
      linkWrapper.children = React.createElement(ChannelPopout, {
        targetElementRef: linkWrapper.children?.props?.ref,
        channel,
        selected,
        messages,
        children: () => children,
        shouldShow,
        onRequestClose: () => this.closePopout(channel.id)
      })
      linkWrapper.children.children = children // Allow other plugins to modify the children
    })
  }

  patchLink ({ link, channel, timeoutRef = React.useRef(null), selected }) {
    const openPopout = () => !selected && this.showPopout(channel)

    if (settings.trigger.displayOn === 'mwheel') {
      const preventDefault = (_, [e]) => e.button === 1 && e.preventDefault()
      Patcher.before(link.props, 'onMouseDown', preventDefault)
      Patcher.before(link.props, 'onAuxClick', preventDefault)
      Patcher.before(link.props, 'onMouseUp', (_, [e]) => e.button === 1 && openPopout())
    }

    if (['hover', 'shift-hover'].includes(settings.trigger.displayOn))
      Patcher.before(link.props, 'onMouseEnter',
        () => timeoutRef.current = setTimeout(openPopout, settings.trigger.hoverDelay * 1000))

    Patcher.before(link.props, 'onMouseLeave', () => {
      clearTimeout(timeoutRef.current)
      this.closePopout(channel.id)
    })

    let ref = React.useRef(null)
    switch (typeof link.props.ref) {
      case 'function': {
        const original = link.props.ref
        link.props.ref = el => {
          ref.current = el
          original(el)
        }
        break
      }
      case 'object': {
        ref = link.props.ref
        break
      }
      default: {
        link.props.ref = ref
        break
      }
    }

    React.useEffect(() => {
      const onWheel = e => {
        if (settings.behaviour.scroll === 'shift' && !e.shiftKey) return

        const scroller = ShownPreviewsStore.getScrollerRef(channel.id)?.current?.getScrollerNode()
        if (!scroller) return

        scroller.scrollTop += e.deltaY
        e.preventDefault()
      }
      ref.current?.addEventListener('wheel', onWheel, { passive: false })
      return () => ref.current?.removeEventListener('wheel', onWheel, { passive: false })
    }, [])
  }

  patchChannelLink () {
    safeAfter(ChannelLink, (self, [{ channel, selected }], value) => {
      const link = findInReactTree(value, m => m?.props?.role && m?.props?.target)
      if (!link) return

      this.patchLink({ link, channel, selected })
    })
  }

  patchThreadChannelItem () {
    if (!ThreadChannelItem || typeof ThreadChannelItem.type !== 'function') {
      cpDebug('ThreadChannelItem module NOT FOUND')
      console.warn('[ChannelsPreview] ThreadChannelItem module not found, thread previews disabled')
      return
    }
    cpDebug('ThreadChannelItem module OK')

    Patcher.after(ThreadChannelItem, 'type', (self, [{ thread, isSelectedChannel }], value) => {
      useUpdater()
      const messages = useStateFromStores([MessageStore], () => MessageStore.getMessages(thread.id))
      const shouldShow = useStateFromStores([ShownPreviewsStore], () => ShownPreviewsStore.shouldShow(thread.id))

      const href = `/channels/${thread.guild_id}/${thread.id}`
      const linkWrapper = findInReactTree(value, m => m?.children?.props?.href === href)
      if (!linkWrapper) {
        cpDebug('thread link NOT FOUND id=' + thread.id)
        console.warn('[ChannelsPreview] thread link not found for', thread.id)
        return
      }
      cpDebug('thread link FOUND id=' + thread.id)

      this.patchLink({
        link: linkWrapper.children,
        channel: thread,
        selected: isSelectedChannel
      })

      const { children } = linkWrapper
      linkWrapper.children = React.createElement(ChannelPopout, {
        targetElementRef: linkWrapper.children?.props?.ref,
        channel: thread,
        selected: isSelectedChannel,
        messages,
        children: () => children,
        shouldShow,
        onRequestClose: () => this.closePopout(thread.id)
      })
      linkWrapper.children.children = children // Allow other plugins to modify the children
    })
  }

  patchDMChannelItem () {
    safeAfter(DMChannelItem, (self, [{ channel, selected }], value) => {
      useUpdater()
      const messages = useStateFromStores([MessageStore], () => MessageStore.getMessages(channel.id))
      const shouldShow = useStateFromStores([ShownPreviewsStore], () => ShownPreviewsStore.shouldShow(channel.id))

      const ref = React.useRef(null)
      if (!value.props.ref) value.props.ref = ref

      const popout = React.createElement(ChannelPopout, {
        targetElementRef: value.props.ref,
        channel,
        selected,
        messages,
        shouldShow,
        onRequestClose: () => this.closePopout(channel.id),
        children: () => React.createElement(DMChannelContext.Provider, {
          value: { channel },
          children: value
        })
      })
      popout.children = value // Allow other plugins to modify the children

      return popout
    })
    safeAfter([FocusRing, 'render'], (self, [{ className }], value) => {
      if (!className?.includes(Selectors.Channel.channel)) return

      const { channel, selected } = React.useContext(DMChannelContext)
      if (!channel) return

      this.patchLink({
        link: value.props.children,
        channel,
        selected
      })
    })
  }

  patchAppView () {
    safeAfter(AppView, (self, args, value) => {
      useUpdater()
      if (!settings.appearance.darkenChat) return

      const page = findInReactTree(value, m => m?.className?.includes(Selectors.AppView.page))
      if (!page) return

      page.children = [
        page.children,
        React.createElement(ChannelPopoutBackdrop)
      ]
    })
  }

  patchMedia () {
    const OBSCURE_REASON = 'explicit_content'

    safeBefore(Attachment, (self, [props]) => {
      const { channel } = React.useContext(PreviewContext)
      if (settings.behaviour.nsfw === 'obscure' && channel?.nsfw)
        props.getObscureReason = () => OBSCURE_REASON
    })

    Embed.contextType = PreviewContext
    Patcher.before(Embed.prototype, 'render', ({ props, context }) => {
      if (settings.behaviour.nsfw === 'obscure' && context.channel?.nsfw && props.embed.image)
        props.obscureReason = OBSCURE_REASON
    })
  }

  attachKeyboardEvents () {
    this.keyboardEvents = {
      onKeyDown: e => Dispatcher.dispatch({ type: 'CP__KEY_DOWN', event: e }),
      onKeyUp: e => Dispatcher.dispatch({ type: 'CP__KEY_UP', event: e })
    }
    addEventListener('keydown', this.keyboardEvents.onKeyDown)
    addEventListener('keyup', this.keyboardEvents.onKeyUp)
  }

  clearKeyboardEvents () {
    removeEventListener('keydown', this.keyboardEvents.onKeyDown)
    removeEventListener('keyup', this.keyboardEvents.onKeyUp)
  }

  injectCSS () {
    //language=CSS
    DOM.addStyle(`${config.info.name}-style`, `
        .CP__popout {
            background-color: var(--bg-overlay-chat, var(--background-base-lower)) !important;
            border-radius: 10px;
            height: 30vh;
            min-height: 150px;
            width: 50vw;
            min-width: 350px;
            overflow: hidden;
            margin-top: 0;
        }

        .CP__container {
            padding-bottom: 25px;
        }

        .CP__container > * {
            list-style: none;
        }

        .CP__scroller {
            display: flex;
            flex-direction: column-reverse;
            overflow-anchor: auto;
        }

        .CP__backdrop {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #000;
            pointer-events: none;
            opacity: 0;
            transition: .3s opacity;
            z-index: 1000;
        }

        .CP__divider-cut {
            margin-top: 40px !important;
        }
        .CP__divider-cut.${Selectors.MessageDividers.divider},
        .CP__divider-cut .${Selectors.MessageDividers.divider} {
            border-style: dashed;
        }
        .CP__divider-cut span {
            font-weight: 400;
        }

        .CP__scroll-hint {
            position: absolute;
            inset: 0;
            z-index: 100;
            background: rgba(0, 0, 0, .6);
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            animation: CP__fadeIn .3s ease;
        }

        @keyframes CP__fadeIn {
            0% {
                opacity: 0
            }
            100% {
                opacity: 1
            }
        }

        #${this.getSettingsPanelId()} {
            color: var(--text-strong);
            line-height: 1;
        }

        #${this.getSettingsPanelId()} .plugin-inputs {
            box-sizing: border-box;
            padding: 0 10px;
        }
    `)
  }

  clearCSS () {
    DOM.removeStyle(`${config.info.name}-style`)
  }

  stop () {
    this.clearCSS()
    Patcher.unpatchAll()
    this.clearKeyboardEvents()
    if (this.onChannelMouseOver) document.removeEventListener('mouseover', this.onChannelMouseOver, true)
    if (this.onChannelMouseOut) document.removeEventListener('mouseout', this.onChannelMouseOut, true)
    this.closePreview()
    delete Embed.contextType

    forceAppUpdate()
  }

  getSettingsPanelId () {
    return `${config.info.name}-settings`
  }

  constructor () {
    this.defaultSettings = {
      trigger: {
        displayOn: 'hover',
        hoverDelay: .4
      },
      behaviour: {
        scroll: 'default',
        nsfw: 'obscure'
      },
      appearance: {
        popoutHeight: 40,
        darkenChat: true,
        darkenLevel: .3,
        displayMode: 'cozy',
        groupSpacingSync: true,
        groupSpacing: 16,

        // Belongs to Behaviour (located here for backwards compatibility)
        messagesCount: 20,
        typingUsers: true
      }
    }

    this.settings = this.loadSettings(this.defaultSettings)
    settings = this.settings

    this.showChangelogIfNeeded()
  }

  loadSettings (defaults = {}) {
    return Utils.extend({}, defaults, Data.load('settings'))
  }
  saveSettings (settings = this.settings) {
    return Data.save('settings', settings)
  }

  showChangelogIfNeeded () {
    const currentVersionInfo = Utils.extend(
      { version: config.info.version, hasShownChangelog: false },
      Data.load('currentVersionInfo')
    )
    if (currentVersionInfo.version === config.info.version && currentVersionInfo.hasShownChangelog) return

    this.showChangelog()
    Data.save('currentVersionInfo', { version: config.info.version, hasShownChangelog: true })
  }
  showChangelog () {
    return UI.showChangelogModal({
      title: config.info.name,
      subtitle: 'Version ' + config.info.version,
      changes: config.changelog
    })
  }

  getSettingsPanel () {
    const plugin = this

    function SettingsPanel () {
      const [_, forceUpdate] = React.useReducer(x => x + 1, 0)
      const onUpdate = React.useCallback(() => {
        plugin.saveSettings()
        settings = plugin.settings
        Dispatcher.dispatch({ type: 'CP__FORCE_UPDATE' })
        forceUpdate()
      }, [])

      return React.createElement(Stack, {
        id: plugin.getSettingsPanelId(),
        gap: 32,
        children: [
          React.createElement(FieldSet, {
            label: 'Trigger',
            children: React.createElement(Stack, {
              gap: 16,
              children: [
                React.createElement(RadioGroup, {
                  options: [
                    { name: 'Hover', value: 'hover' },
                    { name: 'Shift + Hover', value: 'shift-hover' },
                    { name: 'Mouse Wheel Click', value: 'mwheel' }
                  ],
                  value: plugin.settings.trigger.displayOn,
                  onChange: ({ value }) => {
                    plugin.settings.trigger.displayOn = value
                    onUpdate()
                  }
                }),
                ['hover', 'shift-hover'].includes(plugin.settings.trigger.displayOn) && (
                  React.createElement(Slider, {
                    label: 'Hover Delay',
                    description: 'The amount of time to hover before triggering the preview.',
                    initialValue: plugin.settings.trigger.hoverDelay,
                    onValueChange: value => {
                      plugin.settings.trigger.hoverDelay = value
                      onUpdate()
                    },
                    defaultValue: plugin.defaultSettings.trigger.hoverDelay,
                    minValue: .1,
                    maxValue: 2,
                    markers: [...Array(20).keys()].map(n => (n + 1) / 10),
                    stickToMarkers: true,
                    onMarkerRender: m => m % .5 === 0 || m === .1 || m === plugin.defaultSettings.trigger.hoverDelay
                      ? m.toFixed(1) + 's' : ''
                  })
                )
              ]
            })
          }),
          React.createElement(Divider),
          React.createElement(FieldSet, {
            label: 'Behavior',
            children: React.createElement(Stack, {
              gap: 16,
              children: [
                React.createElement(Slider, {
                  label: 'Message Count Limit',
                  description: 'Sets the maximum amount of messages to fetch and display in the preview.',
                  initialValue: plugin.settings.appearance.messagesCount,
                  onValueChange: value => {
                    plugin.settings.appearance.messagesCount = value
                    onUpdate()
                  },
                  defaultValue: plugin.defaultSettings.appearance.messagesCount,
                  minValue: 10,
                  maxValue: 100,
                  markers: [...Array(10).keys()].map(n => (n + 1) * 10),
                  stickToMarkers: true
                }),
                React.createElement(Switch, {
                  label: 'Show typing users',
                  description: 'Shows who\'s typing in the previewed channel.',
                  checked: plugin.settings.appearance.typingUsers,
                  onChange: value => {
                    plugin.settings.appearance.typingUsers = value
                    onUpdate()
                  }
                }),
                React.createElement(RadioGroup, {
                  label: 'Scrolling',
                  options: [
                    {
                      name: 'Scroll',
                      value: 'default',
                      desc: 'Redirect scroll to the preview while it is open.'
                    },
                    {
                      name: 'Shift + Scroll',
                      value: 'shift',
                      desc: 'Redirect scroll to the preview only while holding Shift.'
                    }
                  ],
                  value: plugin.settings.behaviour.scroll,
                  onChange: ({ value }) => {
                    plugin.settings.behaviour.scroll = value
                    onUpdate()
                  }
                }),
                React.createElement(RadioGroup, {
                  label: 'NSFW',
                  options: [
                    {
                      name: 'Show',
                      value: 'show',
                      desc: 'Enable the preview for NSFW channels.'
                    },
                    {
                      name: 'Obscure media',
                      value: 'obscure',
                      desc: 'Blur all images and videos in the preview of NSFW channels.'
                    },
                    {
                      name: 'Don\'t show',
                      value: 'hide',
                      desc: 'Disable the preview for NSFW channels.'
                    }
                  ],
                  value: plugin.settings.behaviour.nsfw,
                  onChange: ({ value }) => {
                    plugin.settings.behaviour.nsfw = value
                    onUpdate()
                  }
                })
              ]
            })
          }),
          React.createElement(Divider),
          React.createElement(FieldSet, {
            label: 'Appearance',
            children: React.createElement(Stack, {
              gap: 16,
              children: [
                React.createElement(Slider, {
                  label: 'Preview Height',
                  description: 'Sets the height of the preview window relative to the Discord window.',
                  initialValue: plugin.settings.appearance.popoutHeight,
                  onValueChange: value => {
                    plugin.settings.appearance.popoutHeight = value
                    onUpdate()
                  },
                  defaultValue: plugin.defaultSettings.appearance.popoutHeight,
                  minValue: 10,
                  maxValue: 90,
                  markers: [...Array(18).keys()].map(n => (n + 1) * 5).slice(1),
                  stickToMarkers: true,
                  onMarkerRender: m => m % 10 === 0 ? m + '%' : ''
                }),
                React.createElement(RadioGroup, {
                  label: 'Message Display',
                  options: [
                    { name: 'Cozy', value: 'cozy' },
                    { name: 'Compact', value: 'compact' }
                  ],
                  value: plugin.settings.appearance.displayMode,
                  onChange: ({ value }) => {
                    plugin.settings.appearance.displayMode = value
                    onUpdate()
                  }
                }),
                React.createElement(Field, {
                  label: 'Space between Message Groups',
                  children: React.createElement(Stack, {
                    children: [
                      React.createElement(Checkbox, {
                        value: plugin.settings.appearance.groupSpacingSync,
                        onChange: (_, value) => {
                          plugin.settings.appearance.groupSpacingSync = value
                          onUpdate()
                        },
                        children: 'Sync with app settings'
                      }),
                      !plugin.settings.appearance.groupSpacingSync && (
                        React.createElement(Slider, {
                          initialValue: plugin.settings.appearance.groupSpacing,
                          onValueChange: value => {
                            plugin.settings.appearance.groupSpacing = value
                            onUpdate()
                          },
                          defaultValue: plugin.defaultSettings.appearance.groupSpacing,
                          minValue: 0,
                          maxValue: 24,
                          markers: [0, 4, 8, 16, 24],
                          stickToMarkers: true,
                          onMarkerRender: m => m + 'px'
                        })
                      )
                    ]
                  })
                }),
                React.createElement(Divider),
                React.createElement(Switch, {
                  label: 'Backdrop',
                  description: 'Darken the chat behind the preview for better contrast.',
                  checked: plugin.settings.appearance.darkenChat,
                  onChange: value => {
                    plugin.settings.appearance.darkenChat = value
                    onUpdate()
                  }
                }),
                plugin.settings.appearance.darkenChat && (
                  React.createElement(Slider, {
                    label: 'Dimming Level',
                    initialValue: plugin.settings.appearance.darkenLevel,
                    onValueChange: value => {
                      plugin.settings.appearance.darkenLevel = value
                      onUpdate()
                    },
                    defaultValue: plugin.defaultSettings.appearance.darkenLevel,
                    minValue: .1,
                    maxValue: 1,
                    markers: [...Array(10).keys()].map(n => (n + 1) / 10),
                    stickToMarkers: true,
                    onMarkerRender: m => (m * 100) + '%'
                  })
                )
              ]
            })
          })
        ]
      })
    }

    return React.createElement(SettingsPanel)
  }
}

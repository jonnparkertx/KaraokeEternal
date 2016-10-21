import React from 'react'
import ReactDOM from 'react-dom'
import {ensureState} from 'redux-optimistic-ui'
import createStore from './store/createStore'
import AppContainer from './containers/AppContainer'
import { authenticateSocket } from './routes/Account/modules/account'
import io from 'socket.io-client'
const socket = io()

socket.on('connect', function () {
  const { token } = ensureState(store.getState()).account

  if (token) {
    // we think we were signed in; check with server
    store.dispatch(authenticateSocket(token))
  }
})

// @todo
// possibly useful in the future
// socket.on('connect_error', function() {
//   console.log('Connection failed')
// })
//
// socket.on('reconnect_failed', function() {
//   console.log('Reconnection failed')
// })

// hack to disable double-tap zooming in iOS 10, see:
// http://stackoverflow.com/questions/37808180/disable-viewport-zooming-ios-10-safari
let lastTouchEnd = 0
document.documentElement.addEventListener('touchend', event => {
  var now = (new Date()).getTime()
  if (now - lastTouchEnd <= 300) {
    event.preventDefault()
  }
  lastTouchEnd = now
}, false)

// ========================================================
// Store Instantiation
// ========================================================
const initialState = window.___INITIAL_STATE__
const store = createStore(initialState, socket)

// ========================================================
// Render Setup
// ========================================================
const MOUNT_NODE = document.getElementById('root')

let render = () => {
  const routes = require('./routes/index').default(store)

  ReactDOM.render(
    <AppContainer store={store} routes={routes} />,
    MOUNT_NODE
  )
}

// ========================================================
// Developer Tools Setup
// ========================================================
// if (__DEV__) {
//   if (window.devToolsExtension) {
//     window.devToolsExtension.open()
//   }
// }

// This code is excluded from production bundle
if (__DEV__) {
  if (module.hot) {
    // Development render functions
    const renderApp = render
    const renderError = (error) => {
      const RedBox = require('redbox-react').default

      ReactDOM.render(<RedBox error={error} />, MOUNT_NODE)
    }

    // Wrap render in try/catch
    render = () => {
      try {
        renderApp()
      } catch (error) {
        renderError(error)
      }
    }

    // Setup hot module replacement
    module.hot.accept('./routes/index', () =>
      setImmediate(() => {
        ReactDOM.unmountComponentAtNode(MOUNT_NODE)
        render()
      })
    )
  }
}

// ========================================================
// Go!
// ========================================================
render()

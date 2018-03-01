!function(exports) {

  'use strict';

  var cachedCssRules = null;
  function getCssRules(useCache) {
    if (cachedCssRules && useCache) {
      return cachedCssRules;
    }
    var rules = { };
    var ds = document.styleSheets;
    var dsl = ds.length;
    for (var i = 0; i < dsl; ++i) {
      var dsi = ds[i].cssRules;
      var dsil = dsi && dsi.length || 0;
      for (var j = 0;j < dsil; ++j) {
        rules[dsi[j].selectorText] = dsi[j];
      }
    }
    cachedCssRules = rules;
    return rules;
  }

  var getCurrentTime = function() {
    var now = new Date();
    var time = [];
    var suffix = ' AM';

    var hours = now.getHours();
    if (hours > 12) {
      suffix = ' PM';
      hours -= 12;
    }

    time.push(hours);
    time.push(':');

    var minutes = now.getMinutes();
    minutes < 10 && time.push('0');

    time.push(minutes);
    time.push(suffix);

    return time.join('');
  };

  var inspectObject = function(obj){
    var str = '';
    Object.keys(obj).forEach(function(elto) {
      str += '\n' + elto + ':' + JSON.stringify(obj[elto]);
    });
    return str;
  };

  var sendEvent = function(eventName, data, target) {
    data = data ? { detail: data } : {};
    var newEvt = new CustomEvent(eventName, data);
    (target || exports).dispatchEvent(newEvt);
  };

  var addHandlers = function(events) {
    Object.keys(events).forEach(function(evtName) {
      var event = events[evtName];
      (event.target || exports).addEventListener(event.name, event.handler);
    });
  };

  var addEventsHandlers = function(eventPreffixName, handlers, target) {
    eventPreffixName = eventPreffixName || '';
    Object.keys(handlers).forEach(function(eventName) {
      // Suspicious...
      (eventName === 'undefined' || eventName === 'null') &&
        console.error(
          new Error('Undefined or null eventName: ' + eventName + '. PN:' + eventPreffixName));

      (target || exports).addEventListener(eventPreffixName + eventName, handlers[eventName]);
    });
  };

  var setTransform = function(style, transform) {
    style.MozTransform = style.webkitTransform = style.msTransform = style.transform = transform;
  };

  // Adds newValue to currValue and returns the new value:
  //  - if currValue is undefined, returns newValue
  //  - if currValue is an array, it makes currValue.push(newValue) and returns currValue
  //  - if currValue is not an array, creates a new one with that value, adds the new value
  //    and returns that
  function _addValue(currValue, newValue) {
    if (currValue === undefined) {
      return newValue;
    }
    if (!Array.isArray(currValue)) {
      currValue = [currValue];
    }
    currValue.push(newValue);
    return currValue;
  }

  // parses a URL search string. It returns an object that has a key the parameter name(s)
  // and as values either the value if the value is unique or an array of values if it exists
  // more than once on the search
  var parseSearch = function(aSearchStr) {
    aSearchStr = decodeStr(aSearchStr);
    return aSearchStr.slice(1).split('&').
      map(function(aParam) { return aParam.split(/=(.+)?/); }).
      reduce(function(aObject, aCurrentValue) {
        var parName = aCurrentValue[0];
        aObject.params[parName] = _addValue(aObject.params[parName], aCurrentValue[1] || null);
        return aObject;
      },
      {
        params: {},
        getFirstValue: function(aParam) {
          return Array.isArray(this.params[aParam]) ? this.params[aParam][0] : this.params[aParam];
        }
      }
    );
  };

  // Aux function to generate a search str from an object with
  // key: value or key: [value1,value2] structure.
  function generateSearchStr(aObject) {
    return Object.keys(aObject).
      reduce(function(aPrevious, aParam, aIndex) {
        var value = aObject[aParam];
        value = Array.isArray(value) ? value : [value];
        value.forEach(function(aSingleValue, aValueIndex) {
          (aIndex + aValueIndex) && aPrevious.push('&');
          aPrevious.push(aParam);
          aSingleValue && aPrevious.push('=', aSingleValue);
        });
        return aPrevious;
      }, ['?']).
      join('');
  }

  function decodeStr(str) {
    return str ? window.decodeURIComponent(str) : str;
  }

  var setDisabled = function(element, disabled) {
    element.disabled = disabled;
    disabled ? element.setAttribute('disabled', 'disabled') :
               element.removeAttribute('disabled');
  };

  var formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  function toPrettyDuration(duration) {
    var time = [];

    // 0 hours -> Don't add digit
    var hours = Math.floor(duration / (60 * 60));
    if (hours) {
      time.push(hours);
      time.push(':');
    }

    // 0 minutes -> if 0 hours -> Don't add digit
    // 0 minutes -> if hours > 0 -> Add minutes with zero as prefix if minutes < 10
    var minutes = Math.floor(duration / 60) % 60;
    if (time.length) {
      (minutes < 10) && time.push('0');
      time.push(minutes);
      time.push(':');
    } else if (minutes) {
      time.push(minutes);
      time.push(':');
    }

    var seconds = duration % 60;
    (time.length) && (seconds < 10) && time.push('0');
    time.push(seconds);

    return time.join('');
  }

  function getLabelText(archive) {
    var date = new Date(archive.createdAt);

    var time = formatter.format(date).toLowerCase();

    var prefix = '';
    time.indexOf(':') === 1 && (prefix = '0');

    var label = [prefix, time, ' - ', archive.recordingUser, '\'s Archive (',
                 toPrettyDuration(archive.duration), 's)'];

    return label.join('');
  }

  function isIE() {
    var userAgent = 'userAgent' in navigator && navigator.userAgent.toLowerCase() || '';
    return /msie/.test(userAgent) || userAgent.indexOf("trident/") !== -1;
  }

  // A simple countdown timer...
  // updateTime: How many milliseconds between updates
  // timerFn: Function to modify the current value called after every updateTime. It
  //   will receive an object of the { time: aTime } form. It should return true if
  //   the timer should continue or false it it should stop, and it can modify the time value.
  // startValue: Initial timer value
  function Timer(updateTime, timerFn, startValue) {
    var currentTime = {
      time: startValue
    };

    var paused = false;
    var intervalId;
    var intervalFn = function(cb) {
      if (paused) {
        return;
      }
      var shouldFinish = !timerFn(currentTime);
      cb(currentTime.time);
      if (shouldFinish) {
        exports.clearInterval(intervalId);
      }
    };

    return  {
      start: function(callback) {
        if (!intervalId) {
          intervalId = exports.setInterval(intervalFn.bind(this, callback), updateTime);
        }
      },
      pause: function() {
        paused = true;
      },
      resume: function() {
        paused = false;
      },
      get currentTime() {
        return currentTime.time;
      },
      set currentTime(time) {
        currentTime.time = time;
      },
      stop: function() {
        if (intervalId) {
          exports.clearInterval(intervalId);
          intervalId = undefined;
        }
      }

    };
  }

  var DefaultTimer = Timer.bind(undefined, 1000, function(aCurrentTime) {
    return --aCurrentTime.time > 0;
  });

  var _parentValidOrigins = [];

  function setParentValidOrigins(aAuthOrigins) {
    _parentValidOrigins =
      Array.isArray(aAuthOrigins) && aAuthOrigins ||
      typeof aAuthOrigins === 'string' && aAuthOrigins.split(',') ||
      [];
  }

  function sendToParent(aType, aData) {
    var parent = window.parent || window.opener;
    if (parent) {
      _parentValidOrigins.concat(document.location.origin).forEach(function(validOrigin) {
        parent.postMessage({
          type: aType,
          data: aData
        }, validOrigin);
      });
    }
  }

  function isOriginValid(origin) {
    return _parentValidOrigins.concat(document.location.origin).find(function(parentValidOrigin) {
      return parentValidOrigin === origin;
    });
  }

  function addMessagesHandlers(handlers) {
    exports.addEventListener('message', function onMessage(event) {
      console.log('Message received from:', event);
      var origin = event.origin || event.originalEvent.origin;
      if (isOriginValid(origin)) {
        // Messages from the inner window will have a type and some other data
        event = event.data;
        var handler = handlers[event.type];
        typeof handler === 'function' && handler(event);
      } else {
        console.warn('Security: ignoring message from:', origin);
      }
    });
  }

  var Utils = {
    setParentValidOrigins: setParentValidOrigins,
    sendToParent: sendToParent,
    DefaultTimer: DefaultTimer,
    Timer: Timer,
    getCurrentTime: getCurrentTime,
    inspectObject: inspectObject,
    sendEvent: sendEvent,
    addMessagesHandlers: addMessagesHandlers,
    addEventsHandlers: addEventsHandlers,
    addHandlers: addHandlers,
    get draggableUI() {
      return document.querySelectorAll('[draggable]').length;
    },
    getDraggable: function() {
      return LazyLoader.dependencyLoad([
        '/js/components/draggable.js'
      ]).then(function() {
        return Draggable;
      });
    },
    isScreen: function(item) {
      var type = item.data('streamType');
      return type === 'desktop' || type === 'screen';
    },
    setTransform: setTransform,
    parseSearch: parseSearch,
    generateSearchStr: generateSearchStr,
    decodeStr: decodeStr,
    isChrome: function() {
      var userAgent = 'userAgent' in navigator && navigator.userAgent.toLowerCase() || '';
      var vendor = 'vendor' in navigator && navigator.vendor.toLowerCase() || '';
      return /chrome|chromium/i.test(userAgent) && /google inc/.test(vendor);
    },
    setDisabled: setDisabled,
    getLabelText: getLabelText,
    isIE: isIE,
    getPathname: function() {
      return document.location.pathname;
    },
    getCssRules: getCssRules
  };

  // Just replacing global.utils might not be safe... let's just expand it...
  exports.Utils = exports.Utils || {};
  Object.keys(Utils).forEach(function (utilComponent) {
    exports.Utils[utilComponent] = Utils[utilComponent];
  });

}(this);

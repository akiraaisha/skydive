var websocket = new WSHandler();

var store = new Vuex.Store({

  state: {
    connected: null,
    logged: null,
    service: null,
    version: null,
    history: null,
    currentNode: null,
    currentEdge: null,
    emphasizedNodes: [],
    highlightedNodes: [],
    highlightInprogress: new Map(),
    notifications: [],
    topologyFilter: "",
    topologyHighlight: "",
    topologyTimeContext: 0,
  },

  getters: {

    currTopologyHighlightExpr: function(state) {
      return state.topologyHighlight;
    },
  },

  mutations: {

    history: function(state, support) {
      state.history = support;
    },

    topologyFilter: function(state, filter) {
      state.topologyFilter = filter;
    },

    topologyHighlight: function(state, filter) {
      state.topologyHighlight = filter;
    },

    topologyTimeContext: function(state, time) {
      state.topologyTimeContext = time;
    },

    login: function(state) {
      state.logged = true;
    },

    logout: function(state) {
      state.logged = false;
    },

    connected: function(state) {
      state.connected = true;
    },

    disconnected: function(state) {
      state.connected = false;
    },

    nodeSelected: function(state, node) {
      state.currentNode = node;
    },

    nodeUnselected: function(state) {
      state.currentNode = null;
    },

    edgeSelected: function(state, edge) {
      state.currentEdge = edge;
    },

    edgeUnselected: function(state) {
      state.currentEdge = null;
    },

    highlight: function(state, id) {
      if (state.highlightedNodes.indexOf(id) < 0) state.highlightedNodes.push(id);
    },

    unhighlight: function(state, id) {
      state.highlightedNodes = state.highlightedNodes.filter(function(_id) {
        return id !== _id;
      });
    },

    highlightStart: function(state, uuid) {
      state.highlightInprogress.set(uuid, true);
    },

    highlightEnd: function(state, uuid) {
      state.highlightInprogress.set(uuid, false);
    },

    highlightDelete: function(state, uuid) {
      state.highlightInprogress.delete(uuid);
    },

    emphasize: function(state, id) {
      if (state.emphasizedNodes.indexOf(id) < 0) state.emphasizedNodes.push(id);
    },

    deemphasize: function(state, id) {
      state.emphasizedNodes = state.emphasizedNodes.filter(function(_id) {
        return id !== _id;
      });
    },

    service: function(state, service) {
      state.service = service.charAt(0).toUpperCase() + service.slice(1);
    },

    version: function(state, version) {
      state.version = version;
    },

    addNotification: function(state, notification) {
      if (state.notifications.length > 0 &&
          state.notifications.some(function(n) {
            return n.message === notification.message;
          })) {
        return;
      }
      state.notifications.push(notification);
    },

    removeNotification: function(state, notification) {
      state.notifications = state.notifications.filter(function(n) {
        return n !== notification;
      });
    },

  },

});

var routes = [
  { path: '/login', component: LoginComponent },
  { path: '/logout',
    component: {
      template: '<div></div>',
      created: function() {
        document.cookie = document.cookie + ';expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        this.$store.commit('logout');
      }
    }
  },
  { path: '/topology', component: TopologyComponent, props: (route) => ({ query: route.query }) },
  { path: '/conversation', component: ConversationComponent },
  { path: '/discovery', component: DiscoveryComponent },
  { path: '/preference', component: PreferenceComponent },
  { path: '*', redirect: '/topology' }
];

var router = new VueRouter({
  mode: 'history',
  linkActiveClass: 'active',
  routes: routes
});

// if not logged, always route to /login
// if already logged don't route to /login
router.beforeEach(function(to, from, next) {
  if (store.state.logged === false && to.path !== '/login')
    next('/login');
  else if (store.state.logged === true && to.path == '/login')
    next(false);
  else
    next();
});

var app = new Vue({
  router: router,

  store: store,

  mixins: [notificationMixin, apiMixin],

  created: function() {
    var self = this;

    this.setTheme("dark");
    this.setThemeFromConfig();

    websocket.addConnectHandler(self.onConnected.bind(self));
    websocket.addDisconnectHandler(self.onDisconnected.bind(self));
    websocket.addErrorHandler(self.onError.bind(self));

    this.checkAPI();

    this.interval = null;

    // global handler to detect authorization errors
    $(document).ajaxError(function(evt, e) {
      switch (e.status) {
        case 401:
          self.$error({message: 'Authentication failed'});
          self.$store.commit('logout');
          break;
      }

      return e;
    });
  },

  computed: Vuex.mapState(['service', 'version', 'logged', 'connected']),

  watch: {

    logged: function(newVal) {
      var self = this;
      if (newVal === true) {
        this.checkAPI();
        router.push('/topology');
        websocket.connect();

        if (!this.interval)
          this.interval = setInterval(this.checkAPI, 5000);

        // check if the Analyzer supports history
        this.$topologyQuery("G.At('-1m').V().Limit(1)")
          .then(function() {
            self.$store.commit('history', true);
          })
          .fail(function() {
            self.$store.commit('history', false);
          });
      } else {
        if (this.interval) {
          clearInterval(self.interval);
          this.interval = null;
        }
        router.push('/login');
      }
    },
  },

  methods: {

    checkAPI: function() {
      var self = this;
      return $.ajax({
        dataType: "json",
        url: '/api',
      })
      .then(function(r) {
        if (!self.$store.state.logged)
          self.$store.commit('login');
        if (self.$store.state.service != r.Service)
          self.$store.commit('service', r.Service);
        if (self.$store.state.version != r.Version)
          self.$store.commit('version', r.Version);
        return r;
      });
    },

    onConnected: function() {
      var self = this;

      self.$store.commit('connected');
      self.$success({message: 'Connected'});
    },

    onDisconnected: function() {
      var self = this;

      self.$store.commit('disconnected');
      self.$error({message: 'Disconnected'});

      if (self.$store.state.logged)
        setTimeout(function(){websocket.connect();}, 1000);
    },

    onError: function() {
      var self = this;

      if (self.$store.state.connected)
        self.$store.commit('disconnected');

      setTimeout(function(){websocket.connect();}, 1000);
    },

    setThemeFromConfig: function() {
      var self = this;

      $.when(this.$getConfigValue('ui.theme'))
        .always(function(theme) {
          if (typeof(self.$route.query.theme) !== "undefined") {
            theme = self.$route.query.theme;
          }
          self.setTheme(theme);
        });
    },

    setTheme: function(theme) {
      switch (theme) {
        case 'light':
          $("#navbar").removeClass("navbar-inverse");
          $("#navbar").addClass("navbar-light");
          break;
        default:
          theme = 'dark';
          $("#navbar").addClass("navbar-inverse");
          $("#navbar").removeClass("navbar-light");
      }

      for (var i = 0; i < document.styleSheets.length; i++) {
        if (document.styleSheets[i].href.search(/themes/) == -1) {
          continue;
        }
        if (document.styleSheets[i].href.search(theme) != -1) {
          document.styleSheets[i].disabled = false;
        } else {
          document.styleSheets[i].disabled = true;
        }
      }
    },
  }

});

$(document).ready(function() {
  Vue.config.devtools = true;

  Vue.use(VTooltip, {});
  Vue.component('datepicker', Datepicker);

  app.$mount('#app');
});

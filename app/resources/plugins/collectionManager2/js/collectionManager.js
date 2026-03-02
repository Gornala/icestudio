//-- Connect the events in js/events.js to the system bus and listen for hooks
registerEvents();

//-- Set up toolbar / search / badge-filter button listeners
setupToolbarEvents();

//Getting environment config, event that start everything inside the plugin
iceStudio.bus.events.publish('pluginManager.getEnvironment');

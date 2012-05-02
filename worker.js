var config = require('./config.js');
var TwitterBot = require('./lib/twitterbot.js');

// Create new instance of twitterbot
var twitterbot = new TwitterBot(config);

// Start polling
twitterbot.poll(config.interval);

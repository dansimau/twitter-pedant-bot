var util = require('util');
var querystring = require('querystring');
var Twit = require('twit');

var TwitterBot = function(config) {
    this.config = config;
    this.twitter = new Twit(config.twitter_auth);
}

util.inherits(TwitterBot, process.EventEmitter);

module.exports = TwitterBot;

TwitterBot.prototype.poll = function(interval) {

    var self = this;
    var next_refresh_url = '';

    setInterval(function() {

        var params = [];

        // Strip leading '?' from refresh_url parameter so it can be parsed by the
        // querystring module.1
        if (next_refresh_url.charAt(0) === '?') {
            next_refresh_url = next_refresh_url.slice(1);
        }

        // Use search parameters specified in the refresh_url parameter of the
        // previous API response (if there was one)
        params = querystring.parse(next_refresh_url);

        // Override the search parameter with our own search string
        params['q'] = self.config.phrase;

        self.twitter.get('search', params, function(err, data) {
            // Update global variable next_refresh_url with the next refresh url
            // as provided by twitter. This will ensure we perform the next search
            // from the last tweet ID, to avoid parsing results we've seen before.
            if ('refresh_url' in data) {
                next_refresh_url = data.refresh_url;
            }

            for (var i = 0, l = data.results.length; i < l; i++) {
                // Have to double check the phrase is actually in the tweet, because
                // the search isn't phrase-based
                if (data.results[i].text.indexOf(self.config.phrase) < 0) {
                    continue;
                }
                // Skip '@' replies
                if (data.results[i].text.charAt(0) === '@') {
                    continue;
                }

                // Construct reply
                console.log('In reply to ' + data.results[i].from_user + ': ' + data.results[i].text);
                var reply = {
                    status: '@' + data.results[i].from_user + ' ' + self.config.response,
                    in_reply_to_status_id: data.results[i].id,
                }
                console.log(reply);
            }
        });
    }, interval || self.config.interval);
}
var Twit = require('twit');
var util = require('util');
var querystring = require('querystring');

var TwitterBot = function(config) {
    this.config = config;
    this.twitter = new Twit(config.twitter_auth);

    // Attach default handler
    this.on('tweets', default_handler);

    this.redis = null;

    // Set up redis (if available)
    if (config.redis) {
        this.redis = require('redis-url').connect(config.redis);
        console.log('Connected to redis ' + config.redis);
    }
}

util.inherits(TwitterBot, process.EventEmitter);

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

        console.log('DEBUG: search params: ');
        console.log(params);

        self.twitter.get('search', params, function(err, data) {

            if (err) {
                console.error(err);
                return false;
            }

            if (data.results.length > 0) {
                console.log('Search returned ' + data.results.length + ' tweet(s).');
            }

            // Update global variable next_refresh_url with the next refresh url
            // as provided by twitter. This will ensure we perform the next search
            // from the last tweet ID, to avoid parsing results we've seen before.
            if ('refresh_url' in data) {
                //next_refresh_url = data.refresh_url;
            }

            var notify_queue = [];

            for (var i = 0, l = data.results.length; i < l; i++) {

                // Have to double check the phrase is actually in the tweet, because
                // the search isn't phrase-based
                if (data.results[i].text.indexOf(self.config.phrase) < 0) {
                    continue;
                }
                // Skip '@' replies
                if (data.results[i].text.indexOf('@') === 0) {
                    continue;
                }
                // Skip retweets
                if (data.results[i].text.indexOf('RT') === 0) {
                    continue;
                }

                // Skip tweets not in the last X hours
                var now = new Date();
                var threshold = new Date(now - 7200*1000);
                var tweet = new Date(data.results[i].created_at);

                if (tweet < threshold) {
                    continue;
                }

                // Add to callback notify queue
                notify_queue.push(data.results[i]);
            }

            console.log(notify_queue.length + ' tweets after filtering.');
            console.log(notify_queue.length + ' tweets after filtering.');

            // If Redis is enabled, check our history to see if we've responded
            // to these tweets before.
            if (self.redis) {
                // Build array of keys
                var keys = [];
                for (tweet in notify_queue) {
                    keys.push(notify_queue[tweet].id);
                }
                self.redis.mget(keys, function(err, replies) {
                    // If there's an error, just continue
                    if (err) {
                        console.error(err);
                    }
                    // Loop through redis replies and filter out any tweets that
                    // are actually in there (as we've replied to them before)
                    for (reply in replies) {
                        if (replies[reply] !== null) {
                            console.log('Skipping ' + reply + ' ' + notify_queue[reply].id + ' because we\'ve seen it before.')
                            delete notify_queue[reply];
                        }
                    }

                    // Clean out undefined values from array
                    notify_queue = notify_queue.filter(function(){return true});

                    // Emit tweet handlers on any remaining tweets
                    if (notify_queue.length > 0) {
                        self.emit('tweets', self, notify_queue);
                    }
                });
            }
        });

    }, interval || self.config.interval);

    console.log('Set up polling for search phrase ("' + self.config.phrase + '") at ' + self.config.interval + 'ms intervals.');
}

module.exports = TwitterBot;

function default_handler(self, tweets) {

    console.log('(Builtin) reply handler invoked for: ' + tweets.length + ' tweets');

    // Construct a reply to each tweet
    for (var i = 0, l = tweets.length; i < l; i++) {
        console.log('[' + i + '] In reply to: ' + tweets[i].from_user + ': ' + tweets[i].text + ' (' + tweets[i].created_at + ')');
        var reply = {
            status: '@' + tweets[i].from_user + ' ' + self.config.response,
            in_reply_to_status_id: tweets[i].id,
        }
        console.log(reply);

        // Insert tweet id into redis so we don't reply to it again
        if (self.redis) {
            console.log('Remembering tweet id ' + tweets[i].id + ' in redis.');
            self.redis.multi().set(tweets[i].id, new Date()).expire(tweets[i].id, 172800).exec();
        }
    }
}
var Twit = require('twit');
var config = require('./config.js')
var querystring = require('querystring');

var twitter = new Twit(config.twitter_auth);

// Global variable
var next_refresh_url = '';

setInterval(function() {

    var params = [];

    // Strip leading '?' from refresh_url parameter so it can be parsed by the
    // querystring module.
    if (next_refresh_url.charAt(0) === '?') {
        next_refresh_url = next_refresh_url.slice(1);
    }

    // Use search parameters specified in the refresh_url parameter of the
    // previous API response (if there was one)
    params = querystring.parse(next_refresh_url);

    // Override the search parameter with our own search string
    params['q'] = config.phrase;

    twitter.get('search', params, function(err, data) {
        // Update global variable next_refresh_url with the next refresh url
        // as provided by twitter. This will ensure we perform the next search
        // from the last tweet ID, to avoid parsing results we've seen before.
        if ('refresh_url' in data) {
            next_refresh_url = data.refresh_url;
        }

        for (var i = 0, l = data.results.length; i < l; i++) {
            // Have to double check the phrase is actually in the tweet, because
            // the search isn't phrase-based
            if (data.results[i].text.indexOf(config.phrase) > 0) {
                // Yes, it is! Construct reply
                console.log('In reply to ' + data.results[i].from_user + ': ' + data.results[i].text);
                var reply = {
                    status: '@' + data.results[i].from_user + ' I think you mean: "bear with me".',
                    in_reply_to_status_id: data.results[i].id,
                }
                console.log(reply);
            }
        }
    });

}, config.interval);

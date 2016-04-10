var http = require('request');
var utils = require('./utils');
var url = require('url');

var fs = require('fs');
var opus = require('node-opus');
var ogg = require('ogg');
var Song = require('./song.js');

const constants = require('./constants');

var musicPlayer = {
    song: null,
    userIdentity: {},
    waitingForMicrophone: false,
    setUserIdentity: function (userIdentity) {
        this.userIdentity = userIdentity;
    },
    waitForMicrophone: function () {
        this.waitingForMicrophone = true;
    },
    clearMicrophoneWait: function () {
        this.waitingForMicrophone = false;
    },
    play: function () {
        if (this.song != null && !this.song.isPlaying()) {
            this.song.play();
            return true;
        }
        return false;
    },
    pause: function (callback) {
        if (this.song != null && !this.song.isPaused()) {
            this.song.once(this.song.states.PAUSED, function () {
                if (typeof(callback) == typeof(Function)) {
                    callback();
                }
            });
            this.song.pause();
        }
        else {
            if (typeof(callback) == typeof(Function)) {
                callback();
            }
        }
    },
    playPauseToggle: function (callback) {
        if (!this.play()) {
            this.pause(callback);
        }
        else {
            if (typeof(callback) == typeof(Function))
                callback();
        }
    },
    _stop: function (callback) {
        if (!(this.song == null || this.song.isStopped() || this.song.isEnded())) {
            this.song.once(this.song.states.STOPPED, function () {
                if (typeof(callback) == typeof(Function)) {
                    callback();
                }
            });
            this.song.stop();
        }
        else {
            if (typeof(callback) == typeof(Function)) {
                callback();
            }
        }
    },
    next: function () {
        musicPlayer._stop(function () {
            console.log("Playback stopped");
            musicPlayer._onPlaybackEnded();
        });
    },
    _onPlaybackEnded: function () {
        musicPlayer._updatePlayedSongInfo(function (err, response) {
            if (err)return console.error(err);
            console.log("Info updated to recommender");
            musicPlayer._getRecommendation(function (err, response) {
                if (err) return console.error(err);
                console.log("Recommendation received");
                musicPlayer._playSong(response.songInfo);
            });
        });
    },
    searchAndPlay: function (params) {
        console.log(params);
        if (params.text == '')
            return false;
        http.post({
            url: constants.SEARCH_ENDPOINT,
            form: {
                q: params.text.trim()
            }
        }, function (err, httpResponse, body) {
            if (err) return console.error(err);
            try {
                var response = JSON.parse(body);
                var songInfo = response.songInfo;
                musicPlayer._stop(function () {
                    console.log("Playback stopped");
                    musicPlayer._updatePlayedSongInfo(function (err, response) {
                        console.log("Info updated to recommender");
                        musicPlayer._playSong(songInfo); // Start playing once we have updated current song to server
                        if (err)return console.error(err);
                    });
                });
            }
            catch (e) {
                console.error(e);
            }
        });
        return true;
    },
    _getOggSongStream: function (songUrl, callback) {
        if (typeof(callback) == typeof(Function)) {
            var fileName = utils.hash(songUrl);
            var cacheContentFile = constants.SONGS_CACHE_CONTENT_DIR + fileName;
            var cacheHeaderFile = constants.SONGS_CACHE_HEADER_DIR + fileName;
            console.log("cacheFile : " + cacheContentFile);
            fs.readFile(cacheHeaderFile, function (headerErr, headerData) {
                fs.stat(cacheContentFile, function (contentErr, stat) {
                    var header;
                    try {
                        header = JSON.parse(headerData.toString());
                    } catch (e) {
                        header = {}
                    }
                    if (headerErr || contentErr || header['content-length'] != stat.size) {
                        var oggStream = http.get(songUrl);
                        oggStream.on('error', function (err) {
                            callback(err);
                        }).on('response', function (response) {
                            if (response.statusCode == 200) {
                                fs.writeFile(cacheHeaderFile, JSON.stringify(response.headers));
                                oggStream.pipe(fs.createWriteStream(cacheContentFile));
                                console.log("Playing from URL");
                                callback(null, oggStream);
                            }
                            else {
                                callback(new Error("OGG HTTP Status code : " + response.statusCode));
                            }
                        });
                    }
                    else {
                        callback(contentErr, fs.createReadStream(cacheContentFile));
                        console.log("Playing from cache");
                    }
                });
            });
        }
        else {
            console.error(new Error("Callback not specified"));
        }
    },
    _playSong: function (songInfo) {
        if (!this.waitingForMicrophone && (this.song == null || this.song.isStopped() || this.song.isEnded())) {
            if (typeof(songInfo.songUrl) == 'undefined' || songInfo.songUrl == '')
                return false;
            if (typeof(songInfo.audioFormat) == 'undefined')
                return false;
            console.log("Playing song : ");
            console.log(songInfo);
            var oggDecoder = new ogg.Decoder();
            oggDecoder.on('stream', function (opusStream) {
                //var opusDecoder = new opus.Decoder(songInfo.audioFormat.sampleRate, songInfo.audioFormat.channels, songInfo.audioFormat.frameSize);
                var opusDecoder = new opus.Decoder();
                opusDecoder.on('format', function (pcmFormat) {
                    musicPlayer.song = new Song({
                        pcmFormat: pcmFormat,
                        pcmStream: opusDecoder,
                        songInfo: songInfo
                    });
                    musicPlayer.song.on(musicPlayer.song.states.ENDED, musicPlayer._onPlaybackEnded);
                    musicPlayer.song.play();
                });
                opusDecoder.on('error', console.error);
                opusStream.pipe(opusDecoder);
            }).on('error', console.error);
            musicPlayer._getOggSongStream(songInfo.songUrl, function (err, oggStream) {
                if (err) return console.error(err);
                oggStream.pipe(oggDecoder);
            });
            return true;
        }
        else {
            console.log("Current song has not been stopped/ended");
            return false;
        }
    },
    _updatePlayedSongInfo: function (callback) {
        if (this.song != null && (this.song.isStopped() || this.song.isEnded())) {
            var form = {
                userIdentity: this.userIdentity,
                playedSongInfo: this.song.getInfo()
            };
            delete form.playedSongInfo.audioFormat;
            console.log(form);
            http.post({
                url: constants.PLAYED_SONG_INFO_UPDATE_ENDPOINT,
                form: form
            }, function (err, httpResponse, body) {
                if (err) return console.error(err);
                try {
                    var response = JSON.parse(body);
                    console.log(response.status);
                    if (typeof(callback) == typeof(Function)) {
                        callback(null, response);
                    }
                }
                catch (e) {
                    console.error(e);
                    if (typeof(callback) == typeof(Function)) {
                        callback(e);
                    }
                }
            });
        }
        else {
            if (typeof(callback) == typeof(Function)) {
                callback(new Error("Song data is not ready to be uploaded"));
            }
        }
    },
    _getRecommendation: function (callback) {
        if (typeof(callback) == typeof(Function)) {
            var form = {
                userIdentity: this.userIdentity
            };
            http.post({
                url: constants.RECOMMENDER_ENDPOINT,
                form: form
            }, function (err, httpResponse, body) {
                if (err) return console.error(err);
                try {
                    console.log(body);
                    var response = JSON.parse(body);
                    if (response.statusCode != 1) {
                        callback(new Error(response.status));
                    }
                    else {
                        callback(null, response);
                    }
                }
                catch (e) {
                    callback(e);
                }
            });
            return true;
        }
        return false;
    }
};

module.exports = musicPlayer;
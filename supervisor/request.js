var passThrough = require('stream').PassThrough;
const constants = require('./constants');

var Request = function (requestParams) {
    this.requestParams = requestParams;
    this.resAudioStreams = [];
    this.decoders = [];
    this.decodings = [];
    this.requiredDecodersPerLanguage = constants.DECODERS_REQUIRED_PER_LANGUAGE;
};

Request.prototype.getUserSocketId = function () {
    return this.requestParams.userSocketId;
};

Request.prototype.getUserPreference = function () {
    return this.requestParams.userPreference;
};

Request.prototype.getParams = function () {
    return this.requestParams;
};

Request.prototype.getCurrentWritableAudioStream = function () {
    return this.resAudioStreams[this.resAudioStreams.length - 1];
};

Request.prototype.getNewWritableAudioStream = function () {
    this.resAudioStreams.push(new passThrough({
        // 128K is good for 30sec of audio
        highWaterMark: 128 * 1024
    }));
    return this.getCurrentWritableAudioStream();
};

Request.prototype.pipeAudioStream = function (destination) {
    var sourceAudioStream = this.getCurrentWritableAudioStream();
    var replacementAudioStream = this.getNewWritableAudioStream();
    sourceAudioStream.pipe(replacementAudioStream);
    sourceAudioStream.pipe(destination);
};

Request.prototype.endAudioStreams = function () {
    // The first stream is the root
    this.resAudioStreams[0].end();
};

Request.prototype.hasDecoder = function (decoderInfo) {
    for (var i = 0; i < this.decoders.length; i++) {
        if (this.decoders[i].socketId == decoderInfo.socketId)
            return true;
    }
    return false;
};

Request.prototype.addDecoder = function (decoderInfo) {
    if (!this.isDecoderCompatible(decoderInfo))
        return false;
    return this.decoders.push(decoderInfo) > 0;
};

Request.prototype.removeDecoder = function (decoderSocketId) {
    for (var i = 0; i < this.decoders.length; i++) {
        if (this.decoders[i].socketId == decoderSocketId) {
            this.decoders.splice(i, 1);
        }
    }
};

Request.prototype.getDecoders = function () {
    return this.decoders;
};

Request.prototype.getDecoderCountForLanguage = function (language) {
    var count = 0;
    for (var i = 0; i < this.decoders.length; i++) {
        count += this.decoders[i].decoderPreference.lang == language;
    }
    return count;
};

Request.prototype.isDecoderRequiredForLanguage = function (language) {
    if (this.getUserPreference().langList.indexOf(language) > -1) {
        return this.getDecoderCountForLanguage(language) < this.requiredDecodersPerLanguage;
    }
    return false;
};

Request.prototype.isDecoderCompatible = function (decoderInfo) {
    return !this.hasDecoder(decoderInfo) && this.isDecoderRequiredForLanguage(decoderInfo.decoderPreference.lang);
};

Request.prototype.addDecoding = function (text, lang) {
    this.decodings.push({
        text: text,
        lang: lang
    })
};

Request.prototype.getText = function () {
    for (var i = 0; i < this.decodings.length; i++) {
        if (this.decodings[i].text != '')
            return this.decodings[i].text;
    }
    return null;
};

Request.prototype.abruptEnd = function () {
    this.endAudioStreams();
};

module.exports = Request;
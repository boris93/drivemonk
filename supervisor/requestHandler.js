var Request = require('./request');

module.exports = {
    requests: [],
    createRequest: function (requestParams) {
        var request = new Request(requestParams);
        this.requests.push(request);
        return request;
    },
    getUnfulfilledRequest: function (decoderInfo) {
        // Return the first unfulfilled request that matches decoder's preference
        // The request with lower index will also be the one that arrived first
        for (var index = 0; index < this.requests.length; index++) {
            if (this.requests[index].isDecoderCompatible(decoderInfo)) {
                return this.requests[index];
            }
        }
        return null;
    },
    getRequestIndex: function (userSocketId) {
        for (var index = 0; index < this.requests.length; index++) {
            if (this.requests[index].getUserSocketId() == userSocketId) {
                return index;
            }
        }
        return -1;
    },
    getRequest: function (userSocketId) {
        var index = this.getRequestIndex(userSocketId);
        if (index > -1)
            return this.requests[index];
        return null;
    },
    markRequestComplete: function (userSocketId) {
        var index = this.getRequestIndex(userSocketId);
        if (index > -1) {
            return this.requests.splice(index, 1).length == 1;
        }
        return false;
    },
    removeDecoder: function (decoderSocketId) {
        this.requests.forEach(function (request) {
            request.removeDecoder(decoderSocketId);
        });
    }
};
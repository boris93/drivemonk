module.exports = {
    decoders: [],
    add: function (decoderInfo) {
        if (this.getDecoderIndex(decoderInfo.socketId) == -1)
            return this.decoders.push(decoderInfo);
        return false;
    },
    get: function () {
        return this.decoders;
    },
    getDecoderInfo: function (socketId) {
        var index = this.getDecoderIndex(socketId);
        if (index > -1)
            return this.decoders[index];
        return null;
    },
    getDecoderIndex: function (socketId) {
        for (var index = 0; index < this.decoders.length; index++) {
            if (this.decoders[index].socketId == socketId)
                return index;
        }
        return -1;
    },
    remove: function (socketId) {
        var index = this.getDecoderIndex(socketId);
        if (index > -1) {
            return this.decoders.splice(index, 1).length == 1;
        }
        return false;
    }
};
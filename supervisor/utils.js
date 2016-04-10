module.exports = {
    filenameGen: function (socketId) {
        return socketId.substr(2) + "_" + Math.floor(Date.now() / 1000);
    }
};
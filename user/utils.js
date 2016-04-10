var crypto = require('crypto');
module.exports = {
    hash: function (url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }
};
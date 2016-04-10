console.clear = function () {
    return process.stdout.write('\033c');
};
console.print = function (string) {
    //console.clear();
    return process.stdout.write("\n\n\n" + string);
};
module.exports = console;
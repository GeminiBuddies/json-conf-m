const confjs = require("./lib/index");

var conf = confjs.Config.FromFile("test.json");

console.log(conf.get("a.x"));
console.log(conf.get("a.y"));
console.log(conf.get("a.y.m"));

conf.set("a.y.n", undefined);
conf.set("a.y.m", 3);
conf.set("a.y.o", "a.y.o");

console.log(conf.get("a.x"));
console.log(conf.get("a.y"));
console.log(conf.get("a.y.m"));

var y = conf.subconfig("a.y");

console.log(y.get("m"));
y.set("m", 4)

console.log(conf.get("a.y"));

var z = conf.subconfig("a.z");
console.log(z);
z = conf.subconfig("a.z", { continueAnyway : true });
console.log(z);

z.set("haha", "hoho");

console.log(conf.get("a"));
conf.delete("a.z");
console.log(conf.get("a"));

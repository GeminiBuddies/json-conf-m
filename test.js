const fs = require("fs");
const confjs = require("./lib/index");

const defaultConf = {
    a: {
        x: 1,
        y: "y-string"
    },
    b: 2
}

fs.writeFileSync("test.json", JSON.stringify(defaultConf));

var conf = confjs.Config.FromFile("test.json");

// basic test
console.log("%basic tests");
console.log(conf.get("a.x"));
console.log(conf.get("b"));

console.log(conf.get("a.z"));

conf.set("a.y", "y-updated");
conf.set("a.z", { m: 42, n: "this-is-a.z.n" });

console.log(conf.get("a.y"));
console.log(conf.get("a.z.n"));

conf.set("b.x.y.z.w", "ichi");

console.log(conf.get("b.x"));

// subconfig test
var confb = conf.subconfig("b");

console.log(confb.get("x.y.z.w"));

confb.set("x.y.z.z", "ni");
confb.set("x.y.z.y", "san");

console.log(conf.get("b.x.y.z"));

var confbxy = confb.subconfig("x.y");

console.log(confbxy.get("z.z"));

confbxy.set("y.y", "shi")
confbxy.set("y.x", "go")
confbxy.set("y.w", "roku")

console.log(confb.get("x"));

console.log("%save");
conf.save(true);

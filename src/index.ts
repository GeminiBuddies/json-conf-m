import * as fs from 'fs';

function JSONStringifyASCIISafe(obj: object): string {
    return JSON.stringify(obj).replace(/[\u007F-\uFFFF]/g, function(chr) {
        return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4);
    });
}

const defaultSplitter = ".";

export abstract class Config {
    protected _separator: string;

    protected constructor(separator: string) {
        this._separator = separator;
    }

    public abstract get source(): string;
    public abstract save(): void;
    public abstract reload(): void;

    // [ finalKey, parent, exists, value, isLeaf ]
    protected _processPathAndLocate(path: string): [ string, any, boolean, any, boolean ] {
        var keys = this._pathProcesser(path);
        var finalKey = keys[keys.length - 1];
        var location = this._locate(keys.slice(0, -1));
        var exists = location !== undefined && finalKey in location;
        var value = exists ? location[finalKey] : undefined;
        var isLeaf = exists ? !(typeof value === "object") : false;

        return [ finalKey, location, exists, value, isLeaf ];
    }

    public exists(path: string): boolean {
        var [ , , exists, , ] = this._processPathAndLocate(path);

        return exists;
    }

    public get(path: string): any {
        var [ , , , value, ] = this._processPathAndLocate(path);

        return value;
    }

    // todo: allow add new nodes
    public set(path: string, value: number | string | boolean | object | null | undefined): void {
        var [ finalKey, location, , , ] = this._processPathAndLocate(path);

        if (location === undefined) return;

        if (value === undefined) {
            if (finalKey in location) delete location[finalKey];
        } else {
            location[finalKey] = value;
        }
    }

    public delete(path: string) {
        this.set(path, undefined);
    }

    public subconfig(path: string, config? : { continueAnyway?: boolean }): Config | undefined {
        config = config || {};
        var continueAnyway = config.continueAnyway || false;
        var keys = this._pathProcesser(path);

        var [ finalKey, location, exists, , isLeaf ] = this._processPathAndLocate(path);

        if ((!exists || isLeaf)) {
            if (continueAnyway) {
                if (location === undefined) location = this._locateOrCreate(keys);
                
                location[finalKey] = {};
            } else {
                return undefined;
            }
        }

        return new Subconfig(this, path, this._separator);
    }

    public abstract all(value: object): void;
 
    // handle [] correctly!
    public locate(path: string[]): any { return this._locate(path); }
    protected abstract _locate(path: string[]): any;
    public locateOrCreate(path: string[]): any { return this._locateOrCreate(path); }
    protected abstract _locateOrCreate(path: string[]): any;
    protected _pathProcesser(path: string): string[] {
        return path.split(this._separator);
    }

    public static FromFile(path: string, config? : { splitter? : string }): Config {
        config = config || {};
        var splitter = config.splitter || defaultSplitter;

        return new FileConfig(path, splitter);
    }

    public static FromObject(source: object, config? : { splitter? : string }): Config {
        config = config || {};
        var splitter = config.splitter || defaultSplitter;

        return new ObjectConfig(source, splitter);
    }
}

abstract class RootConfig extends Config {
    protected _root: object;

    protected constructor(separator: string, root: object) {
        super(separator);
        this._root = root;
    }

    public abstract get source(): string;
    
    public abstract save(): void;
    public abstract reload(): void;

    public all(value: object): void {
        this._root = value;
    }

    protected _locate(path: string[]): any {
        let ptr: any = this._root;
        var len = path.length;

        for (var i = 0; i < len; ++i) {
            var key = path[i];

            if (!(key in ptr && typeof (ptr = ptr[key]) === "object")) return undefined;
        }

        return ptr;
    }

    protected _locateOrCreate(path: string[]): void {
        let ptr: any = this._root;
        var len = path.length;

        for (var i = 0; i < len; ++i) {
            var key = path[i];

            if (!(key in ptr && typeof ptr[key] === "object")) ptr[key] = {};
            ptr = ptr[key];
        }

        return ptr;
    }
}

class FileConfig extends RootConfig {
    _src: string;

    constructor(src: string, separator: string) {
        super(separator, JSON.parse(fs.readFileSync(src).toString()));
        this._src = src;
    }

    public get source(): string {
        return `<file ${this._src}>`;
    }
    
    private _readFromSrc(): void {
        this._root = JSON.parse(fs.readFileSync(this._src).toString());
    }

    private _writeToSrc(): void {
        fs.writeFileSync(this._src, JSONStringifyASCIISafe(this._root || {}));
    }

    public save(): void {
        this._writeToSrc();
    }

    public reload(): void {
        this._readFromSrc();
    }
}

class ObjectConfig extends RootConfig {
    constructor(src: object, separator: string) {
        super(separator, src);
    }

    public get source(): string {
        return `<object>`;
    }

    public save(): void { }
    public reload(): void { }

    public all(value: object): void {
        this._root = value;
    }
}

class Subconfig extends Config {
    protected _parent: Config;
    protected _pathToParent: string;
    protected _keysToParent: string[];

    constructor(parent: Config, pathToParent: string, separator: string) {
        super(separator);

        this._parent = parent;
        this._pathToParent = pathToParent;
        this._keysToParent = this._pathProcesser(pathToParent);
    }

    public get source(): string {
        return `<path \"${this._pathToParent}\"from parent ${this._parent.source}>`;
    }

    public save(): void {
        this._parent.save();
    }

    public reload(): void {
        this._parent.reload();
    }

    public all(value: object): void {
        this._parent.set(this._pathToParent, value);
    }

    protected _locate(path: string[]): any {
        var selfRoot = this._parent.locate(this._keysToParent);

        if (selfRoot === undefined) return undefined;

        var ptr = selfRoot;
        var len = path.length;

        for (var i = 0; i < len; ++i) {
            var key = path[i];

            if (!(key in ptr && typeof (ptr = ptr[key]) === "object")) return undefined;
        }

        return ptr;
    }

    protected _locateOrCreate(path: string[]): any {
        var selfRoot = this._parent.locateOrCreate(this._keysToParent);

        if (selfRoot === undefined) return undefined;

        var ptr = selfRoot;
        var len = path.length;

        for (var i = 0; i < len; ++i) {
            var key = path[i];

            if (!(key in ptr && typeof ptr[key] === "object")) ptr[key] = {};
            ptr = ptr[key];
        }

        return ptr;
    }
}

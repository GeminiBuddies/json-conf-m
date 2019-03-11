import * as fs from 'fs';

function JSONStringifyASCIISafe(obj: object, expand?: boolean): string {
    return JSON.stringify(obj, undefined, expand ? 4 : undefined).replace(/[\u007F-\uFFFF]/g, function(chr) {
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
    public abstract save(expand?: boolean): void;
    public abstract reload(): void;

    public toString(): string { return this.source; }

    // [ finalKey, parent, exists, value, isLeaf ]
    protected _locateAndReadWithPath(path: string, create: boolean): { finalKey: string, location: any, exists: boolean, value: any, isLeaf: boolean } {
        var keys = this._pathProcesser(path);
        var finalKey = keys[keys.length - 1];
        var keys = keys.slice(0, -1);

        var location: any = create ? this._locateOrCreate(keys).result : this._locate(keys);

        if (location == undefined) {
            return { finalKey: finalKey, location: location, exists: false, value: undefined, isLeaf: false };
        }

        var exists = finalKey in location;
        var value = exists ? location[finalKey] : undefined;
        var isLeaf = exists ? !(typeof value === "object") : false;

        return { finalKey: finalKey, location: location, exists: exists, value: value, isLeaf: isLeaf };
    }

    public exists(path: string): boolean {
        return this._locateAndReadWithPath(path, false).exists;
    }

    public get(path: string, defaultValue?: any): any {
        return this._locateAndReadWithPath(path, false).value || defaultValue;
    }

    // todo: allow add new nodes
    public set(path: string, value: number | string | boolean | object | null | undefined): void {
        var loc = this._locateAndReadWithPath(path, true);

        if (value === undefined) {
            if (loc.finalKey in loc.location) delete loc.location[loc.finalKey];
        } else {
            loc.location[loc.finalKey] = value;
        }
    }

    public delete(path: string) {
        this.set(path, undefined);
    }

    public subconfig(path: string, config : { createIfNotExists : true }): Config;
    public subconfig(path: string, config? : { createIfNotExists?: boolean }): Config | undefined {
        config = config || {};
        var createIfNotExists = config.createIfNotExists || false;

        if (this._locateAndReadWithPath(path, createIfNotExists).location === undefined) {
            return undefined;
        }

        return new Subconfig(this, path, this._separator);
    }

    public abstract all(value: object): void;
    public abstract getAll(): object;
 
    // handle [] correctly!
    public locate(path: string[]): object | undefined { return this._locate(path); }
    protected abstract _locate(path: string[]): object | undefined;
    public locateOrCreate(path: string[]): { result: object | undefined, created: boolean } { return this._locateOrCreate(path); }
    protected abstract _locateOrCreate(path: string[]): { result: object | undefined, created: boolean };

    protected _pathProcesser(path: string): string[] {
        return path.split(this._separator);
    }

    protected static _locateOrCreateFromGivenRoot(root: object, path: string[], create: boolean): { result: object | undefined, created: boolean } {
        let ptr: any = root; // as ts have problem indexing objects...
        var len = path.length;
        var created = false;

        for (var i = 0; i < len; ++i) {
            var key = path[i];

            if (!(key in ptr && typeof ptr[key] === "object")) {
                if (!create) return { result: undefined, created: false };

                ptr[key] = {};
                created = true;
            }
            ptr = ptr[key];
        }

        return { result: ptr as object, created : created };
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
    
    public abstract save(expand?: boolean): void;
    public abstract reload(): void;

    public all(value: object): void {
        this._root = value;
    }

    public getAll(): object {
        return this._root;
    }

    protected _locate(path: string[]): any {
        var res = Config._locateOrCreateFromGivenRoot(this._root, path, false);
        return res.result;
    }

    protected _locateOrCreate(path: string[]): { result: any, created: boolean } {
        return Config._locateOrCreateFromGivenRoot(this._root, path, true);
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

    private _writeToSrc(expand?: boolean): void {
        fs.writeFileSync(this._src, JSONStringifyASCIISafe(this._root || {}, expand));
    }

    public save(expand?: boolean): void {
        this._writeToSrc(expand);
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

    public save(expand?: boolean): void { }
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

    public save(expand?: boolean): void {
        this._parent.save(expand);
    }

    public reload(): void {
        this._parent.reload();
    }

    public all(value: object): void {
        this._parent.set(this._pathToParent, value);
    }

    public getAll(): object {
        return this.getSelfRoot(false) as object;
    }

    private getSelfRoot(create: boolean): any {
        if (create) {
            return this._parent.locateOrCreate(this._keysToParent).result;
        } else {
            return this._parent.locate(this._keysToParent);
        }
    }

    protected _locate(path: string[]): any {
        return Config._locateOrCreateFromGivenRoot(this.getSelfRoot(false), path, false).result;
    }

    protected _locateOrCreate(path: string[]): { result: any, created: boolean } {
        return Config._locateOrCreateFromGivenRoot(this.getSelfRoot(true), path, true);
    }
}

/*
 * Copyright 2016 Groupon.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import os = require("os");

import tsdDef = require("tsdDef");

/**
 * Provides an unchanging hostname.
 *
 * @author Matthew Hayter (mhayter at groupon dot com)
 * @class
 */
export class DefaultHostResolver implements tsdDef.HostResolver {
    public getHostname():string {
        return os.hostname();
    }
}

/**
 * Provides an unchanging hostname.
 *
 * @author Matthew Hayter (mhayter at groupon dot com)
 * @class
 */
export class StaticHostResolver implements tsdDef.HostResolver {
    constructor(private _hostname:string){}

    public getHostname():string {
        return this._hostname;
    }
}

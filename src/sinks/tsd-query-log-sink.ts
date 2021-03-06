/*
 * Copyright 2014 Groupon.com
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

import _ = require("underscore");

import tsdDef = require("tsdDef");
import log4js = require("log4js");
import utils = require("../utils");
import metricsSample = require("../tsd-metric-sample");
import tsdSink = require("./tsd-sink");
/**
 * Implementation of [Sink]{@linkcode Sink} to standard the query log file. For an example of its
 * use please refer to the documentation for See {@link module:tsd-metrics-client#init}.
 *
 * @class
 * @alias QueryLogSink
 * @author Mohammed Kamel (mkamel at groupon dot com)
 * @ignore
 */
export class TsdQueryLogSink implements tsdDef.Sink {
    private logger:log4js.Logger;

    public static createQueryLogger(filename:string, maxLogSize:number, backups:number) {
        // TODO(mhayter): Add time-based log rolling.
        var appendersArray:any[] = [
            {
                type: "file",
                filename: filename,
                maxLogSize: maxLogSize,
                backups: backups,
                layout: {
                    type: "pattern",
                    pattern: "%m"
                },
                category: "tsd-client"
            }
        ];
        var config = {
            appenders: appendersArray
        };

        log4js.configure(config, {});

        return new TsdQueryLogSink(log4js.getLogger("tsd-client"));
    }

    public constructor(log4jsLogger:log4js.Logger) {
        this.logger = log4jsLogger;
    }

    /**
     * Invoked by [TsdMetrics]{@linkcode module:tsd-metrics-client~TsdMetrics} to record data to this
     * <code>Sink</code>.
     *
     * @param metricsEvent logEntry to be recorded by the sink.
     */
    public record(metricsEvent:tsdDef.MetricsEvent) {

        this.logger.info(TsdQueryLogSink.stringify(metricsEvent));
    }

    private static stringify(metricsEvent:tsdDef.MetricsEvent):string {
        var transformedMetricsEvent = TsdQueryLogSink.transformMetricsEvent(metricsEvent);

        return JSON.stringify(utils.stenofy(transformedMetricsEvent, metricsEvent.annotations["_host"]),
            (key, value) => {
                if (tsdSink.TsdSink.isMetricSample(value)) {
                    // TODO(matthayter): implement unit numerators & denominators
                    var unit = (<tsdDef.MetricSample>value).getUnit();
                    var sample:any = {
                        value: (<tsdDef.MetricSample>value).getValue()
                    };
                    if (unit != null) {
                        sample.unitNumerators = [unit.name];
                    }
                    return sample
                }
                if (tsdSink.TsdSink.isMetricsList(value)) {
                    return {
                        values: (<tsdDef.MetricsList<tsdDef.MetricSample>>value).getValues()
                    };
                }
                return value;
            });

    }

    private static transformMetricsEvent(metricsEvent:tsdDef.MetricsEvent):any {
        var annotations = _.omit(metricsEvent.annotations, "_host");
        annotations["_start"] = metricsEvent.start.toISOString();
        annotations["_end"] = metricsEvent.end.toISOString();
        var hash:any = {
            annotations: annotations
        };

        if (!utils.isEmptyObject(metricsEvent.counters)) {
            hash.counters = metricsEvent.counters;
        }

        if (!utils.isEmptyObject(metricsEvent.gauges)) {
            hash.gauges = metricsEvent.gauges;
        }

        if (!utils.isEmptyObject(metricsEvent.timers)) {
            hash.timers = metricsEvent.timers;
        }

        hash.version = "2f";
        return hash;
    }
}

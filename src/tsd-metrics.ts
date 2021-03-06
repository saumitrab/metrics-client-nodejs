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

import tsdDef = require("tsdDef");
import events = require("events");
import _ = require("underscore");

import timers = require("./tsd-timer");
import counters = require("./tsd-counter");
import utils = require("./utils");
import timerSamples = require("./timer-samples");
import counterSamples = require("./counter-samples");
import units = require("./tsd-units");
import sample = require("./tsd-metric-sample");
import metricsList = require("./tsd-metrics-list");
import metricsEvent = require("./tsd-metrics-event");
import metricsFactory = require("./tsd-metrics-factory");
import log4jsSink = require("./sinks/tsd-query-log-sink");
import consoleSink = require("./sinks/tsd-console-sink");
import sink = require("./sinks/tsd-sink");
import errors = require("./error-reporting");

//aliases
import TsdTimer = timers.TsdTimer;
import TsdCounter = counters.TsdCounter;
import Lazy = utils.Lazy;
import CounterSamples = counterSamples.CounterSamples;
import TimerSamples = timerSamples.TimerSamples;
import Units = units.Units;
import TsdMetricSample = sample.TsdMetricSample;
import TsdMetricsList = metricsList.TsdMetricsList;
import TsdMetricsEvent = metricsEvent.TsdMetricsEvent;
import TsdMetricsFactory = metricsFactory.TsdMetricsFactory

/**
 * Node JS class for publishing metrics as time series data (TSD).
 *
 * @class
 * @author Mohammed Kamel (mkamel at groupon dot com)
 */
export class TsdMetrics implements tsdDef.Metrics {

    /**
     * Metrics state object that holds flag to the metrics open state along with common event emitter.
     */
    private _metricsStateObject:MetricsStateObject = new MetricsStateObject();
    private _timers:{[name:string]: tsdDef.Timer} = {};
    private _counters:{[name:string]: tsdDef.Counter} = {};
    private _sinks:tsdDef.Sink[];

    /**
     * MetricsEvent field that will be used to serialize the final metric event.
     */
    private _metricsEvent:tsdDef.MetricsEvent = new TsdMetricsEvent();

    private static getOrCreateMetricsCollection<T>(name:string, collectionOfT:{[name:string]:T}, factory:() => T) {
        if (collectionOfT[name] === undefined) {
            collectionOfT[name] = factory();
        }
        return collectionOfT[name];
    }

    private getOrCreateCounterSamples(name:string):CounterSamples {
        return <CounterSamples>TsdMetrics.getOrCreateMetricsCollection(
            name, this._metricsEvent.counters, () => new CounterSamples(name, this._metricsStateObject));
    }

    private getOrCreateTimerSamples(name:string):TimerSamples {
        return <TimerSamples>TsdMetrics.getOrCreateMetricsCollection(
            name, this._metricsEvent.timers, () => new TimerSamples(name, this._metricsStateObject));
    }

    private getOrCreateGaugesSamples(name:string):tsdDef.MetricsList < tsdDef.MetricSample > {
        return TsdMetrics.getOrCreateMetricsCollection(
            name, this._metricsEvent.gauges, () => new TsdMetricsList < tsdDef.MetricSample >());
    }

    /**
     * Constructor.
     */
    constructor(serviceName:string, clusterName:string, hostname:string, sinks:tsdDef.Sink[]) {
        this._sinks = sinks;
        this.addAnnotation("_service", serviceName);
        this.addAnnotation("_cluster", clusterName);
        this.addAnnotation("_host", hostname);
        this._metricsEvent.start = new Date();
    }

    /**
     * Create and initialize a counter sample. It is valid to create multiple
     * <code>Counter</code> instances with the same name, even concurrently,
     * each will record a unique sample for the counter of the specified name.
     *
     * @method
     * @param {string} name The name of the counter.
     * @returns {Counter} TsdCounter instance for recording a counter sample.
     */
    public createCounter(name:string):tsdDef.Counter {
        if (this._metricsStateObject.assertIsOpen()) {
            return this.getOrCreateCounterSamples(name).addCounter();
        }
        return new TsdCounter(name, this._metricsStateObject);
    }

    /**
     * Increment the specified counter by the specified amount. All counters are
     * initialized to zero.
     *
     * @method
     * @param {string} name The name of the counter.
     * @param {number} value The amount to increment by.
     * @emits 'error' if the metrics object is closed
     */
    public incrementCounter(name:string, value:number = 1):void {
        if (this._metricsStateObject.assertIsOpen()) {
            if (this._counters[name] === undefined) {
                this._counters[name] = this.createCounter(name);
            }
            this._counters[name].increment(value);
        }
    }

    /**
     * Decrement the specified counter by the specified amount. All counters are
     * initialized to zero.
     *
     * @method
     * @param {string} name The name of the counter.
     * @param {number} value The amount to decrement by.
     * @emits 'error' if the metrics object is closed
     */
    public decrementCounter(name:string, value:number = 1) {
        this.incrementCounter(name, -value);
    }

    /**
     * Reset the counter to zero. This most commonly used to record a zero-count
     * for a particular counter. If clients wish to record set count metrics
     * then all counters should be reset before conditionally invoking increment
     * and/or decrement.
     *
     * @method
     * @param {string} name The name of the counter.
     */
    public resetCounter(name:string):void {
        if (this._metricsStateObject.assertIsOpen()) {
            this._counters[name] = this.createCounter(name);
        }
    }

    /**
     * Create and start a timer. It is valid to create multiple <code>Timer</code>
     * instances with the same name, even concurrently, each will record a
     * unique sample for the timer of the specified name.
     *
     * @method
     * @param name The name of the timer.
     * @returns {Timer} TsdTimer instance for recording a timing sample.
     */
    public createTimer(name:string):tsdDef.Timer {
        if (this._metricsStateObject.assertIsOpen()) {
            return this.getOrCreateTimerSamples(name).addTimer();
        }
        return new TsdTimer(name, this._metricsStateObject);
    }

    /**
     * Start the specified timer measurement.
     *
     * @method
     * @param {string} name The name of the timer.
     * @emits 'error' if the metrics object is closed or if the timer already started
     */
    public startTimer(name:string):void {
        if (this._metricsStateObject.assertIsOpen() &&
            errors.assertUndefined(this._timers[name],
                "Timer '" + name + "' already started; to time the same event concurrently use createTimer")) {
            this._timers[name] = this.createTimer(name);
        }
    }

    /**
     * Stop the specified timer measurement.
     *
     * @method
     * @param {string} name The name of the timer.
     * @emits 'error' if the metrics object is closed or if the timer already stopped.
     */
    public stopTimer(name:string):void {
        if (this._metricsStateObject.assertIsOpen() &&
            errors.assertDefined(this._timers[name],
                "Cannot stop timer '" + name + "'. No samples have currently started for the timer")) {
            this._timers[name].stop();
            this._timers[name] = undefined;
        }
    }

    /**
     * Set the timer to the specified value. This is most commonly used to
     * record timers from external sources that are not integrated with metrics.
     *
     * @method
     * @param {string} name The name of the timer.
     * @param {number} duration The duration of the timer.
     * @param {Units} unit The unit of time of the duration.
     * @emits 'error' if the metrics object is closed or if not unit specified
     */
    public setTimer(name:string, duration:number, unit:tsdDef.Unit) {
        if (this._metricsStateObject.assertIsOpen()) {
            if (!errors.assertDefined(unit,
                    "No unit specified for explicit timer. Assuming millisecond.")) {
                unit = Units["MILLISECOND"];
            }
            this.getOrCreateTimerSamples(name).addExplicitTimer(duration, unit);
        }
    }

    /**
     * Set the specified gauge reading.
     *
     * @method
     * @param {string} name  The name of the gauge.
     * @param {number} value The reading on the gauge
     * @param {Units} unit The unit of the reading is recorded into. Default = undefined (no unit).
     * @emits 'error' if the metrics object is closed
     */
    public setGauge(name:string, value:number, unit:tsdDef.Unit = undefined) {
        if (this._metricsStateObject.assertIsOpen()) {
            this.getOrCreateGaugesSamples(name).push(TsdMetricSample.of(value, unit));
        }
    }

    /**
     * Add an attribute that describes the captured metrics or context.
     *
     * @param key The name of the attribute.
     * @param value The value of the attribute.
     */
    public addAnnotation(key:string, value:string) {
        if (this._metricsStateObject.assertIsOpen()) {
            this._metricsEvent.annotations[key] = value;
        }
    }

    /**
     * Add a set of attributes that describes the captured metrics or context.
     *
     * @param annotations The string-string pairs that represent the annotations.
     */
    public addAnnotations(annotations: {[key: string]: string}) {
        if (this._metricsStateObject.assertIsOpen()) {
            _.extend(this._metricsEvent.annotations, annotations);
        }
    }

    /**
     * Close the metrics object. This should complete publication of metrics to
     * the underlying data store. Once the metrics object is closed, no further
     * metrics can be recorded.
     *
     * @method
     * @emits 'error' if the metrics object is already closed
     */
    public close() {
        if (this._metricsStateObject.assertIsOpen()) {
            this._metricsEvent.end = new Date();

            this._metricsStateObject.isOpen = false;

            // Shallow clone the metric event
            var metricsEvent = _.clone(this._metricsEvent);

            // Filter out unstopped timers
            for (var timerName in metricsEvent.timers) {
                metricsEvent.timers[timerName] =
                    metricsEvent.timers[timerName].filter((t:tsdDef.Timer) => {
                        if (t.isStopped()) {
                            return true
                        } else {
                            errors.report("Skipping unstopped sample for timer '" + timerName + "'");
                            return false;
                        }
                    })
            }

            this._sinks.forEach(sink => {
                var sinkName = (<any>sink.constructor).name;
                try {
                    sink.record(metricsEvent);
                } catch (err) {
                    errors.report(sinkName + " : " + err.toString());
                }
            });
        }
    }

    /**
     * Returns if the metric object was not closed.
     *
     * @method
     */
    public isOpen():boolean {
        return this._metricsStateObject.isOpen;
    }
}

/**
 * This class allows holds the open state of the metrics object and the event emitter used for logging error and test
 * event.
 * The motive for this class is to avoid passing TsdMetrics instance to timers and counters, and create a
 * circular reference that could be expensive to collect by the GC.
 * The timers and counter needs to check the open state of the TsdMetrics instance and report error if an operation
 * is executed while the TsdMetrics instance is in closed state.
 *
 * @class
 * @ignore
 **/
export class MetricsStateObject {
    public isOpen:boolean = true;

    /**
     * Assert that the metrics object is not closed.
     *
     * @method
     * @param failMessage An optional message to prefix to error message if object is closed.
     * @returns {boolean} True if the metric object is open, otherwise false.
     */
    public assertIsOpen(failMessage:string = ""):boolean {
        return errors.assert(this.isOpen,
            (failMessage == "" ? failMessage : failMessage + ": ") +
            "Metrics object was not opened or it's already closed");
    }
}

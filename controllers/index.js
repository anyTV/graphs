'use strict';

const mysql   = require('anytv-node-mysql');
const winston = require('winston');
const async   = require('async');
const AWS 	  = require('aws-sdk');

let x = null;

exports.get_index_graph = (req, res, next) => {
	const regions = [
		'us-east-1',
		'us-west-2',
		'us-west-1',
		'eu-west-1',
		'eu-central-1',
		'ap-southeast-1',
		'ap-southeast-2',
		'ap-northeast-1',
		'sa-east-1'];
	const requests = {};
	const desc_requests =[];

	let _async = regions.length;
	let data = [];
	let instances = {};

	function start() {
		regions.forEach(function (region) {
			let ec2 = new AWS.EC2({
					apiVersion: '2015-10-01',
					region: region
				}),
				cloudwatch = new AWS.CloudWatch({
					region: region
				}),
				_get_instances = get_instances.bind(undefined, cloudwatch);

			ec2.describeInstances({}, _get_instances);
		});
	}

	function get_instances(cloudwatch, err, result) {
		if (err) {
			winston.error('error getting instances', err);
			return next(err);
		}

		result.Reservations.forEach(function (reservation) {
			reservation.Instances.forEach(function (instance) {
				var start = new Date();
				start.setMinutes(start.getMinutes() - 30);
				
				if (instance.State.Code != 16) {
					return;
				}

				instances[instance.InstanceId] = instance;

				requests[instance.InstanceId+'--CPUUtilization'] = function (callback) {
					cloudwatch.getMetricStatistics({
						StartTime: start,
						EndTime: new Date,
						MetricName: 'CPUUtilization',
						Namespace: 'AWS/EC2',
						Period: 300,
						Statistics: [
							'Average'
						],
						Dimensions: [{
							Name: 'InstanceId',
							Value: instance.InstanceId
						}]
					}, callback);
				};

				requests[instance.InstanceId+'--NetworkIn'] = function (callback) {
					cloudwatch.getMetricStatistics({
						StartTime: start,
						EndTime: new Date,
						MetricName: 'NetworkIn',
						Namespace: 'AWS/EC2',
						Period: 300,
						Statistics: [
							'Average'
						],
						Dimensions: [{
							Name: 'InstanceId',
							Value: instance.InstanceId
						}]
					}, callback);
				};

				requests[instance.InstanceId+'--NetworkOut'] = function (callback) {
					cloudwatch.getMetricStatistics({
						StartTime: start,
						EndTime: new Date,
						MetricName: 'NetworkOut',
						Namespace: 'AWS/EC2',
						Period: 300,
						Statistics: [
							'Average'
						],
						Dimensions: [{
							Name: 'InstanceId',
							Value: instance.InstanceId
						}]
					}, callback);
				};
			});
		});

		async.parallel(requests, send_response);
	}

	function _flatten(data) {
		let return_val = {};

		data.forEach(function (datum) {
			for (let i in datum) {
				console.log(i);
				return_val[i] = datum[i];
			}
		});

		return return_val;
	}

	function send_response(err, result) {
		let send_values = {};

		data.push(result);
		if (!--_async) {
			data = _flatten(data);

			for (var i in data) {
				let instance = i.split('--');

				if (!send_values[instance[0]]) {
					send_values[instance[0]] = {
						instance: instances[instance[0]]
					};
				}

				if (!send_values[instance[0]][instance[1]]) {
					send_values[instance[0]][instance[1]] = [];
				}

				send_values[instance[0]][instance[1]] = data[i].Datapoints;
			}

			x = send_values;
			res.send(send_values);
		}
	}

	return start();
}
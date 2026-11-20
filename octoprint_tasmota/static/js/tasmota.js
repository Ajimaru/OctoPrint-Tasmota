/*
 * View model for OctoPrint-Tasmota
 *
 * Author: jneilliii
 * License: AGPLv3
 */
$(function() {
	function tasmotaViewModel(parameters) {
		var self = this;

		self.settings = parameters[0];
		self.loginState = parameters[1];
		self.filesViewModel = parameters[2];

		self.arrSmartplugs = ko.observableArray();
		self.arrSmartplugsTooltips = ko.observableDictionary({});
		self.arrSmartplugsStates = ko.observableDictionary({});
		self.arrSmartplugsLEDColors = ko.observableDictionary({});
		self.arrSmartplugsDimmer = ko.observableDictionary({});
		self.isPrinting = ko.observable(false);
		self.processing_api_request = ko.observable(false);
		self.gcodeOnString = function(data){return 'M80 '+data.ip()+' '+data.idx();};
		self.gcodeOffString = function(data){return 'M81 '+data.ip()+' '+data.idx();};
		self.selectedPlug = ko.observable();
		self.processing = ko.observableArray([]);
		self.get_color = function(data){
							switch(self.arrSmartplugsStates.get(data.ip()+'_'+data.idx())()) {
								case "on":
									return self.arrSmartplugsLEDColors.get(data.ip()+'_'+data.idx())() ? self.arrSmartplugsLEDColors.get(data.ip()+'_'+data.idx())() : data.on_color();
								case "off":
									return self.arrSmartplugsLEDColors.get(data.ip()+'_'+data.idx())() ? data.unknown_color() : data.off_color();
								default:
									return data.unknown_color();
							}
						};
		self.refreshVisible = ko.observable(true);
		self.automaticShutdownEnabled = ko.observable(false);
		self.filteredSmartplugs = ko.pureComputed(function(){
			return ko.utils.arrayFilter(self.arrSmartplugs(), function(item) {
						return item.automaticShutdownEnabled() == true;
					});
		});

		self.show_sidebar = ko.pureComputed(function(){
			return self.filteredSmartplugs().length > 0;
		});

		self.toggleShutdownTitle = ko.pureComputed(function() {
			return self.automaticShutdownEnabled() ? 'Disable Automatic Power Off' : 'Enable Automatic Power Off';
		});

        self.filesViewModel.getAdditionalData = function(data) {
			var output = "";
			if (data["gcodeAnalysis"]) {
				if (data["gcodeAnalysis"]["dimensions"]) {
					var dimensions = data["gcodeAnalysis"]["dimensions"];
					output += gettext("Model size") + ": " + _.sprintf("%(width).2fmm &times; %(depth).2fmm &times; %(height).2fmm", dimensions);
					output += "<br>";
				}
				if (data["gcodeAnalysis"]["filament"] && typeof(data["gcodeAnalysis"]["filament"]) === "object") {
					var filament = data["gcodeAnalysis"]["filament"];
					if (_.keys(filament).length === 1) {
						output += gettext("Filament") + ": " + formatFilament(data["gcodeAnalysis"]["filament"]["tool" + 0]) + "<br>";
					} else if (_.keys(filament).length > 1) {
						_.each(filament, function(f, k) {
							if (!_.startsWith(k, "tool") || !f || !f.hasOwnProperty("length") || f["length"] <= 0) return;
							output += gettext("Filament") + " (" + gettext("Tool") + " " + k.substr("tool".length)
								+ "): " + formatFilament(f) + "<br>";
						});
					}
				}
				output += gettext("Estimated print time") + ": " + (self.settings.appearance_fuzzyTimes() ? formatFuzzyPrintTime(data["gcodeAnalysis"]["estimatedPrintTime"]) : formatDuration(data["gcodeAnalysis"]["estimatedPrintTime"])) + "<br>";
			}
			if (data["prints"] && data["prints"]["last"]) {
				output += gettext("Last printed") + ": " + formatTimeAgo(data["prints"]["last"]["date"]) + "<br>";
				if (data["prints"]["last"]["printTime"]) {
					output += gettext("Last print time") + ": " + formatDuration(data["prints"]["last"]["printTime"]) + "<br>";
				}
			}
			if (data["statistics"] && data["statistics"]["lastPowerCost"]) {
				output += gettext("Last power cost") + ": " + data["statistics"]["lastPowerCost"]["_default"] + "<br>";
			}
			return output;
		};

		// Hack to remove automatically added Cancel button
		// See https://github.com/sciactive/pnotify/issues/141
		PNotify.prototype.options.confirm.buttons = [];
		self.timeoutPopupText = '';
		self.timeoutPopupOptions = {
			title: '',
			type: 'notice',
			icon: false,
			hide: false,
			confirm: {
				confirm: true,
				buttons: [{
					text: 'Cancel Power Off',
					addClass: 'btn-block btn-danger',
					promptTrigger: true,
					click: function(notice, value){
						notice.remove();
						notice.get().trigger("pnotify.cancel", [notice, value]);
					}
				}]
			},
			buttons: {
				closer: false,
				sticker: false,
			},
			history: {
				history: false
			}
		};

		self.onAutomaticShutdownEvent = function() {
			if (self.automaticShutdownEnabled()) {
				$.ajax({
					url: API_BASEURL + "plugin/tasmota",
					type: "POST",
					dataType: "json",
					data: JSON.stringify({
						command: "enableAutomaticShutdown"
					}),
					contentType: "application/json; charset=UTF-8"
				});
			} else {
				$.ajax({
					url: API_BASEURL + "plugin/tasmota",
					type: "POST",
					dataType: "json",
					data: JSON.stringify({
						command: "disableAutomaticShutdown"
					}),
					contentType: "application/json; charset=UTF-8"
				});
			}
		};

		self.automaticShutdownEnabled.subscribe(self.onAutomaticShutdownEvent, self);

		self.onToggleAutomaticShutdown = function(data) {
			if (self.automaticShutdownEnabled()) {
				self.automaticShutdownEnabled(false);
			} else {
				self.automaticShutdownEnabled(true);
			}
		};

		self.abortShutdown = function(abortShutdownValue) {
			self.timeoutPopup.remove();
			self.timeoutPopup = undefined;
			$.ajax({
				url: API_BASEURL + "plugin/tasmota",
				type: "POST",
				dataType: "json",
				data: JSON.stringify({
					command: "abortAutomaticShutdown"
				}),
				contentType: "application/json; charset=UTF-8"
			});
		};

		self.graph_start_date = ko.observable(moment().subtract(1, 'days').format('YYYY-MM-DDTHH:mm'));
		self.graph_end_date = ko.observable(moment().format('YYYY-MM-DDTHH:mm'));

		self.onBeforeBinding = function() {
			self.arrSmartplugs(self.settings.settings.plugins.tasmota.arrSmartplugs());
            if($('html').attr('id') === 'touch') {
                // $('#sidebar_plugin_tasmota_wrapper > div.accordion-heading > div').appendTo('#sidebar_plugin_tasmota');

            }
		};

		self.onAllBound = function() {
			self.checkStatuses();
		};

		self.onEventSettingsUpdated = function(payload) {
			self.settings.requestData();
			self.arrSmartplugs(self.settings.settings.plugins.tasmota.arrSmartplugs());
		};

		self.onEventPrinterStateChanged = function(payload) {
			if (payload.state_id == "PRINTING" || payload.state_id == "PAUSED"){
				self.isPrinting(true);
			} else {
				self.isPrinting(false);
			}
		};

        self.getDefaultBackground = function() {
          // have to add to the document in order to use getComputedStyle
          var div = document.createElement("div");
          document.head.appendChild(div);
          var bg = window.getComputedStyle(div).backgroundColor;
          document.head.removeChild(div);
          return bg;
        };

        self.getInheritedBackgroundColor = function(el) {
          // get default style for current browser
          if (!self.defaultStyle) {
              self.defaultStyle = self.getDefaultBackground(); // typically "rgba(0, 0, 0, 0)"
          }

          // get computed color for el
          var backgroundColor = window.getComputedStyle(el).backgroundColor;

          // if we got a real value, return it
          if (backgroundColor !== self.defaultStyle) return backgroundColor;

          // if we've reached the top parent el without getting an explicit color, return default
          if (!el.parentElement) return self.defaultStyle;

          // otherwise, recurse and try again on parent element
          return self.getInheritedBackgroundColor(el.parentElement);
        };

		self.plotEnergyData = function(){
		    self.processing_api_request(true);
			$.ajax({
			url: API_BASEURL + "plugin/tasmota",
			type: "POST",
			dataType: "json",
			data: JSON.stringify({
				command: "getEnergyData",
				start_date: self.graph_start_date().replace('T', ' '),
				end_date: self.graph_end_date().replace('T', ' ')
			}),
			contentType: "application/json; charset=UTF-8"
			}).done(function(data){
					//update plotly graph here.
					var energy_labels = [0,0,'Current','Power','Total'];
					var sensor_labels = [0,0,'Temperature','Humidity'];
					var traces = [];

					// Aggregated columns arrive as comma separated strings, but a
					// column is null when a device never reports that metric
					// (e.g. a sensor with temperature but no humidity), which
					// used to throw and leave the whole tab empty.
					var split_column = function(column) {
						if(column === null || column === undefined || column === '') {
							return null;
						}
						return String(column).split(',');
					};

					// Numeric series for the y axes: gaps become null so plotly
					// breaks the line instead of drawing a zero, and a column
					// without a single usable value is skipped entirely.
					var split_series = function(column, length) {
						var values = split_column(column);
						if(values === null) {
							return null;
						}
						if(length !== undefined && values.length !== length) {
							return null;
						}
						var usable = false;
						for(var n=0;n<values.length;n++){
							if(values[n] === '' || isNaN(parseFloat(values[n]))) {
								values[n] = null;
							} else {
								usable = true;
							}
						}
						return usable ? values : null;
					};

					var inherited_bg_color = self.getInheritedBackgroundColor(document.getElementById('tab_plugin_tasmota'));
					var background_color = (inherited_bg_color == 'rgba(0, 0, 0, 0)') ? '#FFFFFF' : inherited_bg_color;
                    var color_val = $('#tab_plugin_tasmota').css('color');
                    var foreground_color = (!color_val || color_val === 'inherit' || color_val === 'transparent') ? '#000000' : color_val;

					var layout = {
                        grid: {
                            rows: (data.sensor_data.length > 0 && data.energy_data.length > 0) ? 6 : (data.energy_data.length > 0) ? 4 : (data.sensor_data.length > 0) ? 2 : 1,
                            columns: 1,
                            pattern: 'independent'
                        },
                        autosize: true,
                        height: (data.sensor_data.length > 0 && data.energy_data.length > 0) ? 1800 : (data.energy_data.length > 0) ? 900 : (data.sensor_data.length > 0) ? 600 : 300,
                        showlegend: false,
                        /* legend: {"orientation": "h"}, */
                        xaxis: {
                            type: "date", /* tickformat:"%H:%M:%S", */ automargin: true,
                            mirror: true,
                            anchor: 'x',
							tickcolor: foreground_color,
							linecolor: foreground_color,
							color: foreground_color
                        },
                        yaxis: {
                            automargin: true,
                            title: {text: 'No Data'},
                            hoverformat: '.3f',
                            anchor:'x',
                            tickangle:-45,
                            tickformat:'.1f',
                            mirror:true,
                            rangemode: 'nonnegative',
							tickcolor: foreground_color,
							linecolor: foreground_color,
							color: foreground_color
                        },
                        margin: {
                            l: 35,
                            r: 30,
                            b: 20,
                            t: 20,
                            pad: 5
                        },
                        plot_bgcolor: background_color,
                        paper_bgcolor: background_color,
                        font: {
                            color: foreground_color
                        }
                    };

					var options = {
						showLink: false,
						sendData: false,
						displaylogo: false,
						displayModeBar: false,
						editable: false,
						showTips: false,
					};

					if(data.sensor_data.length > 0 && data.energy_data.length == 0){ // sensor data only
                        layout.yaxis.title.text = 'Temperature';
                        layout['xaxis2'] = {automargin: true, anchor: 'y2', mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color}
                        layout['yaxis2'] = {automargin:true, title: {text: 'Humidity'}, hoverformat:'.3f', anchor:'x2', tickangle:-45, tickformat:'.1f', mirror:true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color}
                    } else if(data.sensor_data.length == 0 && data.energy_data.length > 0){ // power data only
                        layout.yaxis.title.text = 'Total';
                        layout['xaxis2'] = {anchor: 'y2', mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['yaxis2'] = {automargin: true, title: {text: 'Current'}, hoverformat: '.3f', anchor: 'x2', tickangle: -45, tickformat: '.1f', mirror: true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['xaxis3'] = {anchor: 'y3', mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['yaxis3'] = {automargin: true, title: {text: 'Power'}, hoverformat: '.3f', anchor: 'x3', tickangle: -45, tickformat: '.1f', mirror: true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['xaxis4'] = {anchor: 'y4', showticklabels: true, mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['yaxis4'] = {automargin: true, title: {text: 'Cost'}, hoverformat: '.3f', anchor: 'x4', tickangle: -45, tickformat: '.1f', mirror: true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                    } else if(data.sensor_data.length > 0 && data.energy_data.length > 0) { // sensor and power data
                        layout.yaxis.title.text = 'Total';
                        layout['xaxis2'] = {anchor: 'y2', mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['yaxis2'] = {automargin: true, title: {text: 'Current'}, hoverformat: '.3f', anchor: 'x2', tickangle: -45, tickformat: '.1f', mirror: true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['xaxis3'] = {anchor: 'y3', mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['yaxis3'] = {automargin: true, title: {text: 'Power'}, hoverformat: '.3f', anchor: 'x3', tickangle: -45, tickformat: '.1f', mirror: true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['xaxis4'] = {anchor: 'y4', showticklabels: true, mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['yaxis4'] = {automargin: true, title: {text: 'Cost'}, hoverformat: '.3f', anchor: 'x4', tickangle: -45, tickformat: '.1f', mirror: true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color};
                        layout['xaxis5'] = {anchor: 'y5', mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color}
                        layout['yaxis5'] = {automargin:true, title: {text: 'Temperature'}, hoverformat:'.3f', anchor:'x5', tickangle:-45, tickformat:'.1f', mirror:true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color}
                        layout['xaxis6'] = {anchor: 'y6', showticklabels: true, mirror: true, matches: 'x', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color}
                        layout['yaxis6'] = {automargin:true, title: {text: 'Humidity'}, hoverformat:'.3f', anchor:'x6', tickangle:-45, tickformat:'.1f', mirror:true, rangemode: 'nonnegative', tickcolor: foreground_color, linecolor: foreground_color, color: foreground_color}
                    } else { // no data
                        layout['annotations'] = [{text: 'No Data', xref: 'x domain', yref: 'y domain', x: 0.5, y: 0.5, showarrow: false, font: { size: 16 }}];
                        layout.xaxis['range'] = [self.graph_start_date(), self.graph_end_date()];
                        console.log('no data to graph')
                    }

					for(var i=0;i<data.energy_data.length;i++){
						var energy_timestamps = split_column(data.energy_data[i][1]);
						if(energy_timestamps === null) {
							console.log('skipping energy data without timestamps for ' + data.energy_data[i][0]);
							continue;
						}
						for(var j=2;j<data.energy_data[i].length;j++){
							var energy_values = split_series(data.energy_data[i][j], energy_timestamps.length);
							if(energy_values === null) {
								console.log('skipping ' + energy_labels[j] + ' for ' + data.energy_data[i][0] + ', no usable values');
								continue;
							}
							var trace = {mode: 'lines'};
							var trace_cost = {x:[],y:[],mode:'lines',name:data.energy_data[i][0] + ' Cost', xaxis:'x4', yaxis:'y4'};
							trace['name'] = data.energy_data[i][0] + ' ' + energy_labels[j];
							trace['x'] = energy_timestamps;
							trace['y'] = energy_values;
							switch (j) {
							    case 2: // current
							        trace['xaxis'] = 'x3';
							        trace['yaxis'] = 'y3';
							        break;
							    case 3: // power
							        trace['xaxis'] = 'x2';
							        trace['yaxis'] = 'y2';
							        break;
							    case 4: // total
							        trace['xaxis'] = 'x';
							        trace['yaxis'] = 'y';
                                    trace_cost['x'] = energy_timestamps;
                                    for(var k=0;k<energy_values.length;k++){
                                        trace_cost['y'].push((energy_values[k] === null) ? null : (parseFloat(energy_values[k]) * parseFloat(self.settings.settings.plugins.tasmota.cost_rate())));
                                    }
                                    traces.push(trace_cost);
							        break;
							    default:
							        console.log('unknown energy data column ' + data.energy_data[i])
							    }
							traces.push(trace);
						}
					}

					for(var i=0;i<data.sensor_data.length;i++){
						var sensor_timestamps = split_column(data.sensor_data[i][1]);
						if(sensor_timestamps === null) {
							console.log('skipping sensor data without timestamps for ' + data.sensor_data[i][0]);
							continue;
						}
						for(var j=2;j<data.sensor_data[i].length;j++){
							var sensor_values = split_series(data.sensor_data[i][j], sensor_timestamps.length);
							if(sensor_values === null) {
								console.log('skipping ' + sensor_labels[j] + ' for ' + data.sensor_data[i][0] + ', no usable values');
								continue;
							}
							var trace = {mode: 'lines'};
							trace['name'] = data.sensor_data[i][0] + ' ' + sensor_labels[j];
							trace['x'] = sensor_timestamps;
							trace['y'] = sensor_values;

						    switch(j) {
						        case 2:
						            trace['xaxis'] = (data.energy_data.length > 0) ? 'x5' : 'x';
							        trace['yaxis'] = (data.energy_data.length > 0) ? 'y5' : 'y';
							        break;
                                case 3:
						            trace['xaxis'] = (data.energy_data.length > 0) ? 'x6' : 'x2';
							        trace['yaxis'] = (data.energy_data.length > 0) ? 'y6' : 'y2';
							        break;
						        default:
						            console.log('unknown sensor data column ' + data.sensor_data[i])
						    }

							traces.push(trace);
						}
					}

					Plotly.react('tasmota_graph', traces, layout, options);
					self.processing_api_request(false);
				}).fail(function(){
					self.processing_api_request(false);
				});
		};

		self.legend_visible = ko.observable(false);

		self.toggle_legend = function(){
			self.legend_visible(self.legend_visible() ? false : true);
			Plotly.relayout('tasmota_graph',{showlegend: self.legend_visible()});
		};

		// Live refresh of the graph while the tab is open. Without this the
		// graph only ever updated on tab change or a manual page reload, even
		// with polling enabled. See jneilliii/OctoPrint-Tasmota#210.
		self.graph_refresh_timer = undefined;

		self.graph_window_minutes = function() {
			var start = moment(self.graph_start_date());
			var end = moment(self.graph_end_date());
			if (!start.isValid() || !end.isValid()) {
				return undefined;
			}
			var minutes = end.diff(start, 'minutes');
			return (minutes > 0) ? minutes : undefined;
		};

		self.refreshGraph = function() {
			if (self.processing_api_request()) {
				// a request is still in flight, skip this round
				return;
			}
			// Only follow along when the end of the window is "now", so a
			// manually chosen range is left untouched.
			var window_minutes = self.graph_window_minutes();
			if (window_minutes !== undefined && moment().diff(moment(self.graph_end_date()), 'minutes') <= 2) {
				self.graph_end_date(moment().format('YYYY-MM-DDTHH:mm'));
				self.graph_start_date(moment().subtract(window_minutes, 'minutes').format('YYYY-MM-DDTHH:mm'));
			}
			self.plotEnergyData();
		};

		self.startGraphRefresh = function() {
			self.stopGraphRefresh();
			if (!self.settings || !self.settings.settings.plugins.tasmota.polling_enabled()) {
				return;
			}
			var interval = parseFloat(self.settings.settings.plugins.tasmota.polling_interval());
			if (isNaN(interval) || interval <= 0) {
				return;
			}
			self.graph_refresh_timer = setInterval(self.refreshGraph, interval * 60 * 1000);
		};

		self.stopGraphRefresh = function() {
			if (self.graph_refresh_timer !== undefined) {
				clearInterval(self.graph_refresh_timer);
				self.graph_refresh_timer = undefined;
			}
		};

		self.onTabChange = function(current, previous) {
			if (current === "#tab_plugin_tasmota") {
				self.plotEnergyData();
				self.startGraphRefresh();
			} else if (previous === "#tab_plugin_tasmota") {
				// nothing to redraw while the tab is hidden
				self.stopGraphRefresh();
			}
		};

		self.addPlug = function() {
			self.selectedPlug({'ip':ko.observable(''),
							   'idx':ko.observable('1'),
							   'displayWarning':ko.observable(true),
							   'warnPrinting':ko.observable(false),
							   'gcodeEnabled':ko.observable(false),
							   'gcodeOnDelay':ko.observable(0),
							   'gcodeOffDelay':ko.observable(0),
							   'autoConnect':ko.observable(true),
							   'autoConnectDelay':ko.observable(10.0),
							   'autoDisconnect':ko.observable(true),
							   'autoDisconnectDelay':ko.observable(0),
							   'sysCmdOn':ko.observable(false),
							   'sysRunCmdOn':ko.observable(''),
							   'sysCmdOnDelay':ko.observable(0),
							   'sysCmdOff':ko.observable(false),
							   'sysRunCmdOff':ko.observable(''),
							   'sysCmdOffDelay':ko.observable(0),
							   'currentState':ko.observable('unknown'),
							   'username':ko.observable('admin'),
							   'password':ko.observable(''),
							   'icon':ko.observable('icon-bolt'),
							   'label':ko.observable(''),
							   'label_extended':ko.observable(''),
							   'on_color':ko.observable('#00FF00'),
							   'off_color':ko.observable('#FF0000'),
							   'sensor_identifier':ko.observable(''),
							   'unknown_color':ko.observable('#808080'),
							   'use_backlog':ko.observable(false),
							   'backlog_on_delay':ko.observable(0),
							   'backlog_off_delay':ko.observable(0),
							   'thermal_runaway':ko.observable(false),
							   'automaticShutdownEnabled':ko.observable(false),
							   'event_on_error':ko.observable(false),
							   'event_on_disconnect':ko.observable(false),
							   'event_on_shutdown':ko.observable(false),
							   'event_on_upload':ko.observable(false),
							   'event_on_connecting':ko.observable(false),
							   'is_led':ko.observable(false),
							   'is_sensor_only': ko.observable(false),
							   'keepalive':ko.observable(false),
							   'hide_off':ko.observable(false),
							   'confirm_off':ko.observable(false),
							   'is_dimmable':ko.observable(false),
                               'brightness':ko.observable(50)});
			self.settings.settings.plugins.tasmota.arrSmartplugs.push(self.selectedPlug());
			$("#TasmotaEditor").modal("show");
		};

		self.editPlug = function(data) {
			self.selectedPlug(data);
			$("#TasmotaEditor").modal("show");
		};

		self.removePlug = function(row) {
			self.settings.settings.plugins.tasmota.arrSmartplugs.remove(row);
		};

		self.cancelClick = function(data) {
			self.processing.remove(data.ip());
		};

		self.onDataUpdaterPluginMessage = function(plugin, data) {
			if (plugin != "tasmota" || !data) {
				return;
			}

			if(data.hasOwnProperty("thermal_runaway")){
			    let message = "Thermal runaway was triggered "
                switch (data.type){
                    case "connection":
                        message += "previously.";
                        break
                    case "bed":
                        message += "from the bed.";
                        break
                    case "extruder":
                        message += "from the extruder.";
                        break
                    default:
                        message = "Unknown thermal_runaway type.";
			    }

			    if (self.thermal_runaway_notice !== undefined) {
                    self.thermal_runaway_notice.update({text: message});
                    self.thermal_runaway_notice.open();
                } else {
                    self.thermal_runaway_notice = new PNotify({
                        title: "Tasmota Error",
                        type: "error",
                        text: message,
                        hide: false
                    });
                }
			    return;
            }

			if(data.hasOwnProperty("powerOffWhenIdle")) {
				self.settings.settings.plugins.tasmota.powerOffWhenIdle(data.powerOffWhenIdle);

				if (data.type == "timeout") {
					if ((data.timeout_value != null) && (data.timeout_value > 0) && (typeof(ko.utils.arrayFirst(self.arrSmartplugsStates.items(), function(item){return item.value() == 'on'})) !== 'undefined')) {
						var progress_percent = Math.floor((data.timeout_value/self.settings.settings.plugins.tasmota.abortTimeout())*100)
						var progress_class = (progress_percent<25)?'progress-danger':(progress_percent>75)?'progress-success':'progress-warning';
						self.timeoutPopupOptions.text = '<div class="progress progress-tasmota '+progress_class+'"><div class="bar">'+gettext('Powering Off in ')+' '+data.timeout_value+' '+gettext('secs')+'</div><div class="progress-text" style="clip-path: inset(0 0 0 '+progress_percent+'%);-webkit-clip-path: inset(0 0 0 '+progress_percent+'%);">'+gettext('Powering Off in ')+' '+data.timeout_value+' '+gettext('secs')+'</div></div>';
						if (typeof self.timeoutPopup != "undefined") {
							self.timeoutPopup.update(self.timeoutPopupOptions);
						} else {
							self.timeoutPopup = new PNotify(self.timeoutPopupOptions);
							self.timeoutPopup.get().on('pnotify.cancel', function() {self.abortShutdown(true);});
						}
					} else {
						if (typeof self.timeoutPopup != "undefined") {
							self.timeoutPopup.remove();
							self.timeoutPopup = undefined;
						}
					}
				}
			} else {
				plug = ko.utils.arrayFirst(self.settings.settings.plugins.tasmota.arrSmartplugs(),function(item){
					return ((item.ip().toUpperCase() == data.ip.toUpperCase()) && (item.idx() == data.idx));
					}) || {'ip':data.ip,'idx':data.idx,'currentState':'unknown','gcodeEnabled':false};

				if(self.settings.settings.plugins.tasmota.debug_logging()){
					console.log(self.settings.settings.plugins.tasmota.arrSmartplugs());
					console.log('msg received:'+JSON.stringify(data));
					console.log('plug data:'+ko.toJSON(plug));
				}


				var has_dimmer = (data.dimmer !== undefined && data.dimmer !== null);
				if (has_dimmer) {
					self.arrSmartplugsDimmer.set(data.ip + '_' + data.idx, data.dimmer);
				}

				var tooltip = '';
				if (data.sensor_data || data.energy_data || has_dimmer) {
					tooltip += '<table style="width: 100%"><thead></thead><tbody>';
					if(has_dimmer) {
						tooltip += '<tr><td>' + gettext('Brightness') + ':</td><td>' + parseInt(data.dimmer, 10) + ' %</td></tr>';
					}
					if(data.sensor_data) {
						for(let k in data.sensor_data) {
							tooltip += '<tr><td>' + k + ':</td><td>' + data.sensor_data[k] + '</td></tr>';
						}
					}
					if(data.energy_data) {
						for(let k in data.energy_data) {
							tooltip += '<tr><td>' + k + ':</td><td>' + data.energy_data[k] + '</td></tr>';
						}
					}
					tooltip += '</tbody></table>';
					$(('#tasmota_button_link_'+data.ip+'_'+data.idx).replace(/[.:]/g,'_')).removeClass('hide_popover_content');
				} else {
					$(('#tasmota_button_link_'+data.ip+'_'+data.idx).replace(/[.:]/g,'_')).addClass('hide_popover_content');
				}
                try {
                    self.arrSmartplugsTooltips.set(data.ip+'_'+data.idx, tooltip);
                } catch (error) {
				    self.processing.remove(data.ip);
				    console.log('tooltip', error);
                }
				try {
                    self.arrSmartplugsStates.set(data.ip + '_' + data.idx, data.currentState);
                } catch (error) {
				    self.processing.remove(data.ip);
				    console.log('currentState', error);
                }
				// A device configured as a pure sensor (no relay) legitimately
				// reports no power state, so an unknown state is expected there
				// and must not raise an error on every poll. Prefer the explicit
				// "Hide" flag, and fall back to a device that only ever answers
				// with sensor data.
				var sensor_only = false;
				try {
				    sensor_only = !!ko.utils.unwrapObservable(plug.is_sensor_only) ||
				                  !!(ko.utils.unwrapObservable(plug.sensor_identifier) && data.sensor_data);
				} catch (error) {
				    sensor_only = false;
				}
				if (["on", "off"].indexOf(data.currentState) === -1 && !sensor_only) {
                    new PNotify({
                        title: 'Tasmota Error',
                        text: 'Status ' + plug.currentState() + ' for ' + plug.ip() + '. Double check IP Address\\Hostname in Tasmota Settings.',
                        type: 'error',
                        hide: true
                        });
				}
				if(data.color){
				    var color = (data.color.LEDBrightness > 0) ? 'RGB(' + data.color.LEDRed + ',' + data.color.LEDGreen + ',' + data.color.LEDBlue + ')' : plug["unknown_color"];
				    self.arrSmartplugsLEDColors.set(data.ip + '_' + data.idx, color);
                }
				self.processing.remove(data.ip);
			}
		};

		self.toggleRelay = function(data) {
            if(data.is_sensor_only()){
                return
            }
			// do not start the spinner for a power off that will be refused
			if(ko.utils.unwrapObservable(data.hide_off) &&
			   self.arrSmartplugsStates.get(data.ip()+'_'+data.idx())() === "on"){
				return;
			}
			self.processing.push(data.ip());
			switch(self.arrSmartplugsStates.get(data.ip()+'_'+data.idx())()){
				case "on":
					self.turnOff(data);
					break;
				case "off":
					self.turnOn(data);
					break;
				default:
					self.checkStatus(data);
			}
		};

		self.turnOn = function(data) {
			self.sendTurnOn(data);
		};

		self.dimmerText = function(data) {
			var value = self.arrSmartplugsDimmer.get(data.ip() + '_' + data.idx())();
			return (value === null || value === undefined) ? '-' : parseInt(value, 10) + ' %';
		};

		// Sent on "change" (slider released), not on every "input" event, so
		// dragging does not flood the device with Dimmer commands.
		self.setDimmer = function(data, event) {
			var value = parseInt(event.target.value, 10);
			if (isNaN(value)) {
				return;
			}
			self.processing.push(data.ip());
			$.ajax({
				url: API_BASEURL + "plugin/tasmota",
				type: "POST",
				dataType: "json",
				data: JSON.stringify({
					command: "setDimmer",
					ip: data.ip(),
					idx: data.idx(),
					value: value
				}),
				contentType: "application/json; charset=UTF-8"
			}).done(function(response){
				self.onDataUpdaterPluginMessage('tasmota', response);
			}).fail(function(jqXHR){
				self.processing.remove(data.ip());
				new PNotify({
					title: 'Tasmota Error',
					text: 'Could not set brightness for ' + data.label() + ': ' + (jqXHR.responseText || jqXHR.statusText),
					type: 'error',
					hide: true
				});
			});
		};

		self.sendTurnOn = function(data) {
			$.ajax({
				url: API_BASEURL + "plugin/tasmota",
				type: "POST",
				dataType: "json",
				data: JSON.stringify({
					command: "turnOn",
					ip: data.ip(),
					idx: data.idx(),
					username: data.username(),
					password: data.password(),
					backlog_delay: data.backlog_on_delay()
				}),
				contentType: "application/json; charset=UTF-8"
			}).done(function(data){
			    console.log('on', data);
			    self.onDataUpdaterPluginMessage('tasmota', data);
            });
		};

		self.turnOff = function(data) {
			// #209: manual power off can be disabled per plug, so an accidental
			// click cannot cut power to a printer that is mid print or has a
			// mounted filesystem. Automation is unaffected.
			if(ko.utils.unwrapObservable(data.hide_off)){
				console.log('manual power off is disabled for ' + data.ip());
				self.processing.remove(data.ip());
				return;
			}
			var needs_confirmation = data.displayWarning() ||
									 ko.utils.unwrapObservable(data.confirm_off) ||
									 (self.isPrinting() && data.warnPrinting());
			if(needs_confirmation && !$("#TasmotaWarning").is(':visible')){
				self.selectedPlug(data);
				$("#TasmotaWarning").modal("show");
			} else {
				$("#TasmotaWarning").modal("hide");
				self.sendTurnOff(data);
			}
		};

		self.sendTurnOff = function(data) {
			$.ajax({
			url: API_BASEURL + "plugin/tasmota",
			type: "POST",
			dataType: "json",
			data: JSON.stringify({
				command: "turnOff",
					ip: data.ip(),
					idx: data.idx(),
					username: data.username(),
					password: data.password(),
					backlog_delay: data.backlog_off_delay()
			}),
			contentType: "application/json; charset=UTF-8"
			}).done(function(data){
			    console.log('off', data);
			    self.onDataUpdaterPluginMessage('tasmota', data);
            });
		};

		self.checkSetOption26 = function(data, evt) {
			evt.currentTarget.blur();
			$.ajax({
				url: API_BASEURL + "plugin/tasmota",
				type: "POST",
				dataType: "json",
				data: JSON.stringify({
					command: "checkSetOption26",
					ip: data.ip(),
                    idx: data.idx(),
					username: data.username(),
					password: data.password()
				}),
				contentType: "application/json; charset=UTF-8"
			}).done(function(response){
				if(response["SetOption26"] == "OFF" && data.idx() !== '') {
					var test = confirm("SetOption26 needs to be updated to ON for proper operation. Would you like to set that option now?");
					if (test) {
						$.ajax({
							url: API_BASEURL + "plugin/tasmota",
							type: "POST",
							dataType: "json",
							data: JSON.stringify({
								command: "setSetOption26",
								ip: data.ip(),
								username: data.username(),
								password: data.password()
							}),
							contentType: "application/json; charset=UTF-8"
						}).done(function(response){
							if(response["SetOption26"] == "ON"){
								alert("SetOption26 updated to ON for proper operation.");
								self.checkStatuses();
							}
						});
					}
				} else {
					alert("Tasmota device responded and is configured properly.");
				}
				});
		};

		self.checkStatus = function(data) {
			$.ajax({
				url: API_BASEURL + "plugin/tasmota",
				type: "POST",
				dataType: "json",
				data: JSON.stringify({
					command: "checkStatus",
					ip: data.ip(),
					idx: data.idx()
				}),
				contentType: "application/json; charset=UTF-8"
			});
		};

		self.checkStatuses = function() {
			ko.utils.arrayForEach(self.settings.settings.plugins.tasmota.arrSmartplugs(),function(item){
				if(item.ip() !== "") {
					if(self.settings.settings.plugins.tasmota.debug_logging()){
						console.log("checking " + item.ip() + " index " + item.idx());
					}
					self.checkStatus(item);
				}
			});
		};
	}

	// view model class, parameters for constructor, container to bind to
	OCTOPRINT_VIEWMODELS.push([
		tasmotaViewModel,
		["settingsViewModel","loginStateViewModel","filesViewModel"],
		["#navbar_plugin_tasmota","#settings_plugin_tasmota","#tab_plugin_tasmota","#sidebar_plugin_tasmota_wrapper"]
	]);
});

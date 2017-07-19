import * as _ from 'lodash'
import owid from '../owid'
import ChartType from './ChartType'
import {computed, autorun, action} from 'mobx'
import ChartConfig from './ChartConfig'
import VariableData from './VariableData'
import EntityKey from './EntityKey'
import {bind} from 'decko'

export default class ChartData {
	chart: ChartConfig
	vardata: VariableData

	constructor(chart: ChartConfig, vardata: VariableData) {
		this.chart = chart
		this.vardata = vardata

		autorun(this.validateEntities)
	}

	// When available entities changes, we need to double check that any selection is still appropriate
	@bind validateEntities() {
		const {chart, vardata} = this
		if (!vardata.isReady) return

		const {availableEntities, entityMetaByKey} = vardata
		let validEntities = chart.selectedEntities.filter(entity => entityMetaByKey[entity])

		if (_.isEmpty(validEntities) && chart.type != ChartType.ScatterPlot && chart.type != ChartType.DiscreteBar && chart.type != ChartType.SlopeChart) {
			// Select a few random ones
			validEntities = _.sampleSize(availableEntities, 3);
		}

		action(() => chart.selectedEntities = validEntities)()
	}

	@computed get availableEntities() {
		return this.vardata.availableEntities
	}

	@computed get data() {
		const {chart, vardata} = this
		const {variablesById} = vardata

		if (chart.type == ChartType.ScatterPlot || chart.tab == 'map' || _.isEmpty(variablesById) || _.isEmpty(chart.dimensions))
			return null;

		let result
		if (chart.type == ChartType.LineChart)
			result = this.transformDataForLineChart();
		else if (chart.type == ChartType.StackedArea)
			result = this.transformDataForStackedArea();
		else if (chart.type == ChartType.DiscreteBar)
			result = this.transformDataForDiscreteBar();
		else
			result = this.transformDataForLineChart();
		
		/*if (addCountryMode != "add-country" && chartType != ChartType.DiscreteBar) {
			_.each(result.legendData, function(d) {
				d.disabled = !this.chart.isLegendKeyActive(d.key);
			});
			_.each(result.chartData, function(d) {
				d.disabled = !this.chart.isLegendKeyActive(d.key);
			});
		}*/
		chart.colors.assignColorsForLegend(result.legendData);
		chart.colors.assignColorsForChart(result.chartData);		

		return result;		
	}

	@computed get chartData() {
		return this.data ? this.data.chartData : []
	}

	@computed get legendData() {
		return this.data ? this.data.legendData : []
	}

	@computed get primaryVariable() {
		const yDimension = _.find(this.chart.dimensions, { property: 'y' })
		return yDimension ? this.vardata.variablesById[yDimension.variableId] : undefined
	}

	transformDataForLineChart() {
		const {chart, vardata} = this
		const {timeDomain, selectedEntitiesByKey, yAxis, addCountryMode} = chart
		const dimensions = _.clone(chart.dimensions).reverse()
		const {variablesById} = vardata

		const timeFrom = _.defaultTo(timeDomain[0], -Infinity),
			timeTo = _.defaultTo(timeDomain[1], Infinity),
			hasManyVariables = _.size(variablesById) > 1,
			hasManyEntities = _.size(selectedEntitiesByKey) > 1

		let chartData = []
		let legendData = []
		let minYear = Infinity
		let maxYear = -Infinity

		_.each(dimensions, function(dimension) {
			var variable = variablesById[dimension.variableId],
				variableName = dimension.displayName || variable.name,
				seriesByEntity: {[key: EntityKey]: any} = {};

			for (var i = 0; i < variable.years.length; i++) {
				var year = variable.years[i],
					value = _.toNumber(variable.values[i]),
					entity = variable.entities[i],
					series = seriesByEntity[entity];
					
				// Not a selected entity, don't add any data for it
				if (!selectedEntitiesByKey[entity]) continue;
				// It's possible we may be missing data for this year/entity combination
				// e.g. http://ourworldindata.org/grapher/view/101
				if (isNaN(value)) continue;
				// Values <= 0 break d3 log scales horribly
				if (yAxis.scaleType === 'log' && value <= 0) continue;
				// Check for time range
				if (year < timeFrom || year > timeTo) continue;

				if (!series) {
					let key = entity,
						id = entity;

					if (!hasManyEntities && addCountryMode == "disabled") {
						id = variable.id.toString();
						key = variableName;
					} else if (hasManyVariables) {
						id += "-" + variable.id;
						key += " - " + variableName;
					}

					series = {
						values: [],
						key: key,
						label: entity,
						entityName: entity,
						entityId: entity,
						variableId: variable.id,
						id: id,
						isProjection: dimension.isProjection
					};
					seriesByEntity[entity] = series;
				}

				var prevValue = series.values[series.values.length-1];
				if (prevValue)
					prevValue.gapYearsToNext = year-prevValue.x;
				series.values.push({ x: year, y: value, time: year });
				minYear = Math.min(minYear, year);
				maxYear = Math.max(maxYear, year);
			}

			chartData = chartData.concat(_.values(seriesByEntity));
		});

		//if (addCountryMode === "add-country")
			chartData = _.sortBy(chartData, function(series) { return series.entityName; });

		legendData = _.map(chartData, function(series) {
			return { label: series.key, key: series.key, entityId: series.entityId, variableId: series.variableId };
		});

		return { chartData: chartData, legendData: legendData, minYear: minYear, maxYear: maxYear };
	}

	// Ensures that every series has a value entry for every year in the data
	// Even if that value is just 0
	// Stacked area charts with incomplete data will fail to render otherwise
	zeroPadData(chartData) {
		var allYears = {};
		var yearsForSeries = {};

		_.each(chartData, function(series) {
			yearsForSeries[series.id] = {};
			_.each(series.values, function(d, i) {
				allYears[d.x] = true;
				yearsForSeries[series.id][d.x] = true;
			});
		});

		_.each(chartData, function(series) {
			_.each(Object.keys(allYears), function(year) {
				year = parseInt(year);
				if (!yearsForSeries[series.id][year])
					series.values.push({ x: year, y: 0, time: year, fake: true });
			});

			series.values = _.sortBy(series.values, function(d) { return d.x; });
		});

		return chartData;
	},

	// Zero pads for every single year in the data
	zeroPadDataRange(chartData) {
		var minYear = Infinity, maxYear = -Infinity;
		_.each(chartData, function(series) {
			minYear = Math.min(minYear, series.values[0].x);
			maxYear = Math.max(maxYear, series.values[series.values.length-1].x);
		});

		var yearsForSeries = {};
		_.each(chartData, function(series) {
			yearsForSeries[series.id] = {};
			_.each(series.values, function(d, i) {
				yearsForSeries[series.id][d.x] = true;
			});
		});

		_.each(chartData, function(series) {
			for (var year = minYear; year <= maxYear; year++) {
				if (!yearsForSeries[series.id][year])
					series.values.push({ x: year, y: 0, time: year, fake: true });
			}
			series.values = _.sortBy(series.values, function(d) { return d.x; });
		});

		return chartData;
	},

	transformDataForStackedArea() {
		//if (!this.chart.get("group-by-variables")) {
			var result = this.transformDataForLineChart();
			result.chartData = this.zeroPadData(result.chartData);
			return result;
		//}

		/*const {chart, vardata} = this
		const {dimensions} = chart
		const {variablesById} = vardata

			// Group-by-variable chart only has one selected country
			selectedCountry = _.values(this.chart.getSelectedEntitiesById())[0],
			chartData = [], legendData = [],
			timeFrom = this.chart.getTimeFrom(),
			timeTo = this.chart.getTimeTo(),
			minYear = Infinity,
			maxYear = -Infinity;

		_.each(dimensions, function(dimension) {
			var variable = variables[dimension.variableId];

			var series = {
				id: variable.id,
				key: dimension.displayName || variable.name,
				entityName: selectedCountry.name,
				entityId: selectedCountry.id,
				variableId: dimension.variableId,
				values: []
			};

			for (var i = 0; i < variable.years.length; i++) {
				var year = parseInt(variable.years[i]),
					value = parseFloat(variable.values[i]),
					entityId = variable.entities[i];

				if (entityId != selectedCountry.id) continue;
				if (year < timeFrom || year > timeTo) continue;

				series.values.push({ x: year, y: value, time: year });
				minYear = Math.min(minYear, year);
				maxYear = Math.max(maxYear, year);
			}

			chartData.push(series);
		});

		chartData = this.zeroPadData(chartData);

		legendData = _.map(chartData, function(series) {
			return { label: series.label, key: series.key, entityId: series.entityId, variableId: series.variableId };
		});

		return { chartData: chartData, legendData: legendData, minYear: minYear, maxYear: maxYear };*/
	}


	getSourceDescHtml(variable, source) {
		var html = '';

		html += '<div class="datasource-wrapper">' +
			   		'<h2>' + variable.name + '</h2>';


		html += 	'<table class="variable-desc">';

		if (variable.description)
			html +=		'<tr><td>Variable description</td><td>' + variable.description + '</td>';
		if (variable.coverage)
			html += 	'<tr><td>Variable geographic coverage</td>' + variable.coverage + '</td>';
		if (variable.timespan)
			html += 	'<tr><td>Variable time span</td>' + variable.timespan + '</td>';

		html += 	'</table>';

		html +=	   	source.description +
				'</div>';


		return html;
	}

	transformDataForSources() {
		const {chart, vardata} = this
		const {dimensions} = chart
		const {variablesById} = vardata


		if (_.isEmpty(variablesById)) return []

		let sources = _.map(dimensions, (dim) => {
			const variable = variablesById[dim.variableId]
			const source = _.clone(variable.source)

			// HACK (Mispy): Ignore the default color source on scatterplots.
			if (variable.name == "Countries Continents" || variable.name == "Total population (Gapminder)")
				source.ignore = true;

			source.description = this.getSourceDescHtml(variable, variable.source);
			return source;
		});

		sources = _.filter(sources, function(source) { return !source.ignore; });
		return sources;
	},
});

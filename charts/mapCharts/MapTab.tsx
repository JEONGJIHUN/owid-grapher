import * as React from "react"
import { Bounds } from "charts/utils/Bounds"
import { observable, computed, action } from "mobx"
import { observer } from "mobx-react"
import {
    ChoroplethMap,
    ChoroplethData,
    ChoroplethDatum,
    GeoFeature,
    MapBracket,
    MapEntity
} from "charts/mapCharts/ChoroplethMap"
import { MapColorLegend } from "charts/mapCharts/MapColorLegend"
import { MapColorLegendView } from "./MapColorLegendView"
import { getRelativeMouse } from "charts/utils/Util"
import { ChartConfig } from "charts/core/ChartConfig"
import { MapTransform } from "./MapTransform"
import { MapProjection } from "./MapProjections"
import { select } from "d3-selection"
import { easeCubic } from "d3-ease"
import { ChartLayout, ChartLayoutView } from "charts/core/ChartLayout"
import { ChartView } from "charts/core/ChartView"
import { LoadingOverlay } from "charts/core/LoadingOverlay"
import { ControlsOverlay } from "charts/controls/Controls"
import { MapTooltip } from "./MapTooltip"
import { ProjectionChooser } from "./ProjectionChooser"
import { ColorScale } from "charts/color/ColorScale"

const PROJECTION_CHOOSER_WIDTH = 110
const PROJECTION_CHOOSER_HEIGHT = 22

// TODO refactor to use transform pattern, bit too much info for a pure component

interface MapWithLegendProps {
    bounds: Bounds
    choroplethData: ChoroplethData
    years: number[]
    inputYear?: number
    formatYear: (year: number) => string
    colorScale: ColorScale
    projection: MapProjection
    defaultFill: string
    mapToDataEntities: { [id: string]: string }
    chart: ChartConfig
    chartView: ChartView
}

@observer
class MapWithLegend extends React.Component<MapWithLegendProps> {
    @observable.ref tooltip: React.ReactNode | null = null
    @observable tooltipTarget?: { x: number; y: number; featureId: string }

    @observable focusEntity?: MapEntity
    @observable focusBracket?: MapBracket

    base: React.RefObject<SVGGElement> = React.createRef()
    @action.bound onMapMouseOver(d: GeoFeature, ev: React.MouseEvent) {
        const datum =
            d.id === undefined ? undefined : this.props.choroplethData[d.id]
        this.focusEntity = { id: d.id, datum: datum || { value: "No data" } }

        const mouse = getRelativeMouse(this.props.chartView.base.current, ev)
        if (d.id !== undefined)
            this.tooltipTarget = {
                x: mouse.x,
                y: mouse.y,
                featureId: d.id as string
            }
    }

    @computed get chart() {
        return this.props.chart
    }

    @action.bound onMapMouseLeave() {
        this.focusEntity = undefined
        this.tooltipTarget = undefined
    }

    // Determine if we can go to line chart by clicking on a given map entity
    private isEntityClickable(featureId: string | number | undefined) {
        const chart = this.chart
        if (
            !chart.hasChartTab ||
            !(chart.isLineChart || chart.isScatter) ||
            this.props.chartView.isMobile ||
            featureId === undefined
        )
            return false

        const entity = this.props.mapToDataEntities[featureId]
        const datakeys = chart.availableKeysByEntity.get(entity)

        return datakeys && datakeys.length > 0
    }

    @action.bound onClick(d: GeoFeature, ev: React.MouseEvent<SVGElement>) {
        if (!this.isEntityClickable(d.id)) return
        const chart = this.chart
        const entityName = this.props.mapToDataEntities[d.id as string]

        if (!ev.shiftKey) {
            chart.tab = "chart"
            chart.selectOnlyThisEntity(entityName)
        } else {
            chart.toggleEntitySelectionStatus(entityName)
        }
    }

    componentWillUnmount() {
        this.onMapMouseLeave()
        this.onLegendMouseLeave()
    }

    @action.bound onLegendMouseOver(d: MapBracket) {
        this.focusBracket = d
    }

    @action.bound onTargetChange({
        targetStartYear
    }: {
        targetStartYear: number
    }) {
        this.chart.mapTransform.targetYear = targetStartYear
    }

    @action.bound onLegendMouseLeave() {
        this.focusBracket = undefined
    }

    @action.bound onProjectionChange(value: MapProjection) {
        this.chart.mapTransform.props.projection = value
    }

    @computed get mapLegend(): MapColorLegend {
        const that = this
        return new MapColorLegend({
            get bounds() {
                return that.props.bounds.padBottom(15)
            },
            get legendData() {
                return that.props.colorScale.legendData
            },
            get equalSizeBins() {
                return that.props.colorScale.config.equalSizeBins
            },
            get title() {
                return ""
            },
            get focusBracket() {
                return that.focusBracket
            },
            get focusValue() {
                return that.focusEntity?.datum?.value
            },
            get fontSize() {
                return that.chart.baseFontSize
            }
        })
    }

    @computed get tooltipDatum(): ChoroplethDatum | undefined {
        return this.tooltipTarget
            ? this.props.choroplethData[this.tooltipTarget.featureId]
            : undefined
    }

    componentDidMount() {
        select(this.base.current)
            .selectAll("path")
            .attr("data-fill", function () {
                return (this as SVGPathElement).getAttribute("fill")
            })
            .attr("fill", this.props.colorScale.noDataColor)
            .transition()
            .duration(500)
            .ease(easeCubic)
            .attr("fill", function () {
                return (this as SVGPathElement).getAttribute("data-fill")
            })
            .attr("data-fill", function () {
                return (this as SVGPathElement).getAttribute("fill")
            })
    }

    @computed get projectionChooserBounds() {
        const { bounds } = this.props
        return new Bounds(
            bounds.width - PROJECTION_CHOOSER_WIDTH + 15 - 3,
            5,
            PROJECTION_CHOOSER_WIDTH,
            PROJECTION_CHOOSER_HEIGHT
        )
    }

    render() {
        const { choroplethData, projection, defaultFill, bounds } = this.props
        const {
            focusBracket,
            focusEntity,
            mapLegend,
            tooltipTarget,
            projectionChooserBounds
        } = this

        const tooltipProps = {
            inputYear: this.props.inputYear,
            formatYear: this.props.formatYear,
            mapToDataEntities: this.props.mapToDataEntities,
            tooltipDatum: this.tooltipDatum,
            isEntityClickable: this.isEntityClickable(tooltipTarget?.featureId)
        }

        return (
            <g ref={this.base} className="mapTab">
                <ChoroplethMap
                    bounds={bounds.padBottom(mapLegend.height + 15)}
                    choroplethData={choroplethData}
                    projection={projection}
                    defaultFill={defaultFill}
                    onHover={this.onMapMouseOver}
                    onHoverStop={this.onMapMouseLeave}
                    onClick={this.onClick}
                    focusBracket={focusBracket}
                    focusEntity={focusEntity}
                />
                <MapColorLegendView
                    legend={mapLegend}
                    onMouseOver={this.onLegendMouseOver}
                    onMouseLeave={this.onLegendMouseLeave}
                />
                <ControlsOverlay id="projection-chooser">
                    <ProjectionChooser
                        bounds={projectionChooserBounds}
                        value={projection}
                        onChange={this.onProjectionChange}
                    />
                </ControlsOverlay>
                {tooltipTarget && (
                    <MapTooltip
                        {...tooltipProps}
                        tooltipTarget={tooltipTarget}
                        chart={this.chart}
                    />
                )}
            </g>
        )
    }
}

interface MapTabProps {
    chart: ChartConfig
    chartView: ChartView
    bounds: Bounds
}

@observer
export class MapTab extends React.Component<MapTabProps> {
    @computed get map(): MapTransform {
        return this.props.chart.mapTransform as MapTransform
    }

    @computed get layout() {
        const that = this
        return new ChartLayout({
            get chart() {
                return that.props.chart
            },
            get chartView() {
                return that.props.chartView
            },
            get bounds() {
                return that.props.bounds
            }
        })
    }

    render() {
        const { map } = this
        const { layout } = this

        return (
            <ChartLayoutView layout={this.layout}>
                {this.props.chart.isReady ? (
                    <MapWithLegend
                        chart={this.props.chart}
                        chartView={this.props.chartView}
                        bounds={layout.innerBounds}
                        choroplethData={map.choroplethData}
                        years={map.timelineYears}
                        inputYear={map.targetYearProp}
                        colorScale={map.colorScale}
                        projection={map.projection}
                        defaultFill={map.colorScale.noDataColor}
                        mapToDataEntities={map.mapToDataEntities}
                        formatYear={map.formatYear}
                    />
                ) : (
                    <LoadingOverlay bounds={layout.innerBounds} />
                )}
            </ChartLayoutView>
        )
    }
}

/* AxisBox.tsx
 * ================
 *
 * Standard axis box layout model. Precompute before rendering and pass it around.
 *
 * @project Our World In Data
 * @author  Jaiden Mispy
 * @created 2017-02-11
 */

import * as React from "react"
import { observable, computed, reaction, action } from "mobx"
import { observer } from "mobx-react"
import { Bounds } from "charts/utils/Bounds"
import { AxisScale } from "./AxisScale"
import { VerticalAxis, VerticalAxisView } from "./VerticalAxis"
import { HorizontalAxis, HorizontalAxisView } from "./HorizontalAxis"
import { AxisSpec } from "./AxisSpec"
import { ScaleType } from "charts/core/ChartConstants"
import { extend } from "charts/utils/Util"
import classNames from "classnames"

interface AxisBoxProps {
    bounds: Bounds
    fontSize: number
    xAxisSpec: AxisSpec
    yAxisSpec: AxisSpec
}

// AxisBox has the important task of coordinating two axes so that they work together!
// There is a *two-way dependency* between the bounding size of each axis.
// e.g. if the y axis becomes wider because a label is present, the x axis then has less
// space to work with, and vice versa
export class AxisBox {
    private props: AxisBoxProps

    @observable private targetYDomain: [number, number] = [1, 100]
    @observable private targetXDomain: [number, number] = [1, 100]
    @observable private prevYDomain: [number, number] = [1, 100]
    @observable private prevXDomain: [number, number] = [1, 100]
    @observable private animProgress?: number
    private frameStart?: number

    constructor(props: AxisBoxProps) {
        this.props = props
    }

    @computed.struct private get currentYDomain(): [number, number] {
        if (this.animProgress === undefined) return this.props.yAxisSpec.domain

        const [prevMinY, prevMaxY] = this.prevYDomain
        const [targetMinY, targetMaxY] = this.targetYDomain

        // If we have a log axis and are animating from linear to log do not set domain min to 0
        const progress = this.animProgress
            ? this.animProgress
            : this.props.yAxisSpec.scaleType === ScaleType.log
            ? 0.01
            : 0

        return [
            prevMinY + (targetMinY - prevMinY) * progress,
            prevMaxY + (targetMaxY - prevMaxY) * this.animProgress
        ]
    }

    @computed.struct private get currentXDomain(): [number, number] {
        if (this.animProgress === undefined) return this.props.xAxisSpec.domain

        const [prevMinX, prevMaxX] = this.prevXDomain
        const [targetMinX, targetMaxX] = this.targetXDomain

        // If we have a log axis and are animating from linear to log do not set domain min to 0
        const progress = this.animProgress
            ? this.animProgress
            : this.props.xAxisSpec.scaleType === ScaleType.log
            ? 0.01
            : 0

        return [
            prevMinX + (targetMinX - prevMinX) * progress,
            prevMaxX + (targetMaxX - prevMaxX) * this.animProgress
        ]
    }

    @action.bound setupAnimation() {
        this.targetYDomain = this.props.yAxisSpec.domain
        this.targetXDomain = this.props.xAxisSpec.domain
        this.animProgress = 1

        reaction(
            () => [this.props.yAxisSpec.domain, this.props.xAxisSpec.domain],
            () => {
                this.prevXDomain = this.currentXDomain
                this.prevYDomain = this.currentYDomain
                this.targetYDomain = this.props.yAxisSpec.domain
                this.targetXDomain = this.props.xAxisSpec.domain
                this.animProgress = 0
                requestAnimationFrame(this.frame)
            }
        )
    }

    @action.bound private frame(timestamp: number) {
        if (this.animProgress === undefined) return

        if (!this.frameStart) this.frameStart = timestamp
        this.animProgress = Math.min(
            1,
            this.animProgress + (timestamp - this.frameStart) / 300
        )

        if (this.animProgress < 1) requestAnimationFrame(this.frame)
        else this.frameStart = undefined
    }

    @computed get yAxisSpec() {
        return extend({}, this.props.yAxisSpec, { domain: this.currentYDomain })
    }

    @computed get xAxisSpec() {
        return extend({}, this.props.xAxisSpec, { domain: this.currentXDomain })
    }

    // We calculate an initial width/height for the axes in isolation
    @computed private get xAxisHeight() {
        return new HorizontalAxis({
            scale: new AxisScale(this.xAxisSpec).clone({
                range: [0, this.props.bounds.width]
            }),
            labelText: this.xAxisSpec.label,
            fontSize: this.props.fontSize
        }).height
    }

    @computed private get yAxisWidth() {
        return new VerticalAxis({
            scale: new AxisScale(this.yAxisSpec).clone({
                range: [0, this.props.bounds.height]
            }),
            labelText: this.yAxisSpec.label,
            fontSize: this.props.fontSize
        }).width
    }

    // Now we can determine the "true" inner bounds of the axis box
    @computed get innerBounds(): Bounds {
        return this.props.bounds
            .padBottom(this.xAxisHeight)
            .padLeft(this.yAxisWidth)
    }

    @computed get xScale() {
        return new AxisScale(this.xAxisSpec).clone({
            range: this.innerBounds.xRange()
        })
    }

    @computed get yScale() {
        return new AxisScale(this.yAxisSpec).clone({
            range: this.innerBounds.yRange()
        })
    }

    @computed get horizontalAxis() {
        const that = this
        return new HorizontalAxis({
            get scale() {
                return that.xScale
            },
            get labelText() {
                return that.xAxisSpec.label
            },
            get fontSize() {
                return that.props.fontSize
            }
        })
    }

    @computed get verticalAxis() {
        const that = this
        return new VerticalAxis({
            get scale() {
                return that.yScale
            },
            get labelText() {
                return that.yAxisSpec.label
            },
            get fontSize() {
                return that.props.fontSize
            }
        })
    }

    @computed get bounds() {
        return this.props.bounds
    }
}

interface AxisGridLinesProps {
    orient: "left" | "bottom"
    scale: AxisScale
    bounds: Bounds
}

@observer
export class AxisGridLines extends React.Component<AxisGridLinesProps> {
    render() {
        const { orient, bounds } = this.props
        const scale = this.props.scale.clone({
            range: orient === "left" ? bounds.yRange() : bounds.xRange()
        })

        return (
            <g
                className={classNames(
                    "AxisGridLines",
                    orient === "left" ? "horizontalLines" : "verticalLines"
                )}
            >
                {scale.getTickValues().map((t, i) => {
                    const color = t.faint
                        ? "#eee"
                        : t.value === 0
                        ? "#ccc"
                        : "#d3d3d3"
                    if (orient === "left")
                        return (
                            <line
                                key={i}
                                x1={bounds.left.toFixed(2)}
                                y1={scale.place(t.value)}
                                x2={bounds.right.toFixed(2)}
                                y2={scale.place(t.value)}
                                stroke={color}
                                strokeDasharray={
                                    t.value !== 0 ? "3,2" : undefined
                                }
                            />
                        )
                    else
                        return (
                            <line
                                key={i}
                                x1={scale.place(t.value)}
                                y1={bounds.bottom.toFixed(2)}
                                x2={scale.place(t.value)}
                                y2={bounds.top.toFixed(2)}
                                stroke={color}
                                strokeDasharray={
                                    t.value !== 0 ? "3,2" : undefined
                                }
                            />
                        )
                })}
            </g>
        )
    }
}

interface AxisBoxViewProps {
    axisBox: AxisBox
    highlightValue?: { x: number; y: number }
    showTickMarks: boolean
    isInteractive: boolean
}

@observer
export class AxisBoxView extends React.Component<AxisBoxViewProps> {
    componentDidMount() {
        requestAnimationFrame(this.props.axisBox.setupAnimation)
    }

    render() {
        const { axisBox, showTickMarks } = this.props
        const {
            bounds,
            xScale,
            yScale,
            horizontalAxis,
            verticalAxis,
            innerBounds
        } = axisBox

        const maxX = undefined // {chartView.tabBounds.width} todo

        return (
            <g className="AxisBoxView">
                <HorizontalAxisView
                    maxX={maxX}
                    bounds={bounds}
                    axisPosition={innerBounds.bottom}
                    axis={horizontalAxis}
                    showTickMarks={showTickMarks}
                    isInteractive={this.props.isInteractive}
                />
                <VerticalAxisView
                    bounds={bounds}
                    axis={verticalAxis}
                    isInteractive={this.props.isInteractive}
                />
                {!yScale.hideGridlines && (
                    <AxisGridLines
                        orient="left"
                        scale={yScale}
                        bounds={innerBounds}
                    />
                )}
                {!xScale.hideGridlines && (
                    <AxisGridLines
                        orient="bottom"
                        scale={xScale}
                        bounds={innerBounds}
                    />
                )}
            </g>
        )
    }
}

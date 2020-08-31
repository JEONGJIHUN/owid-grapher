import * as React from "react"
import { OwidVariableDisplaySettings } from "owidTable/OwidVariable"
import ReactDOM from "react-dom"
import { clone } from "charts/utils/Util"
import { computed, IReactionDisposer, observable } from "mobx"
import { ChartRuntime } from "charts/core/ChartRuntime"
import { ChartFigureView } from "./ChartFigureView"
import { observer } from "mobx-react"
import { owidVariableId } from "owidTable/OwidTable"

interface Variable {
    id: owidVariableId
    name: string
    unit: string
    shortUnit: string
    description: string
    display: OwidVariableDisplaySettings

    datasetId: number
    datasetName: string
    datasetNamespace: string

    source: { id: number; name: string }
}

interface Country {
    id: number
    name: string
}

@observer
class ClientVariableCountryPage extends React.Component<{
    variable: Variable
    country: Country
}> {
    @observable.ref chart?: ChartRuntime

    @computed get chartConfig() {
        const { variable, country } = this.props
        return {
            yAxis: { min: 0 },
            map: { variableId: variable.id },
            tab: "chart",
            hasMapTab: true,
            dimensions: [
                {
                    property: "y",
                    variableId: variable.id,
                    display: clone(variable.display)
                }
            ],
            selectedData: [
                {
                    entityId: country.id,
                    index: 0
                }
            ]
        }
    }

    dispose!: IReactionDisposer
    componentDidMount() {
        this.chart = new ChartRuntime(this.chartConfig as any, {
            isEmbed: true
        })
    }

    render() {
        const { variable, country } = this.props
        return (
            <React.Fragment>
                <h1>
                    {variable.name} in {country.name}
                </h1>
                {this.chart && <ChartFigureView chart={this.chart} />}
            </React.Fragment>
        )
    }
}

export function runVariableCountryPage(props: any) {
    ReactDOM.render(
        <ClientVariableCountryPage {...props} />,
        document.querySelector("main")
    )
}

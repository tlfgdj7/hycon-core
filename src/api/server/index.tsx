import * as React from "react"
import { ReactElement } from "react"
import { renderToString } from "react-dom/server"
import { StaticRouter } from "react-router"
import { App } from "../client/app"
import { RestServer } from "./restServer"

export function indexRender(
    rest: RestServer,
    url: string,
    context: any,
): string {
    const render = renderToString(
        <StaticRouter location={url} context={context}>
            <App rest={rest} />
        </StaticRouter>,
    )
    const html = `
        <!doctype html>
        <html>
            <head>
                <meta charset="UTF-8" />
                <title>Hycon Block Explorer</title>
                <script src="/react/umd/react.development.js"></script>
                <script src="/react-dom/umd/react-dom.development.js"></script>
                <script src="/react-router/umd/react-router.js"></script>
                <script src="/react-router-config/umd/react-router-config.js"></script>
                <script src="/react-router-dom/umd/react-router-dom.js"></script>
                <link rel="stylesheet" href="/styles.css" type="text/css">
            </head>
            <body>
                <div id="blockexplorer">
                    ${render}
                </div>
                <script src="/bundle.js"></script>
            </body>
        </html>
    `
    return html
}
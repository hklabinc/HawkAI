// AIRuler Result Stats (Box plot + all points)
// - Depends on Plotly.js (loaded in Pages/_Layout.cshtml)
// - Used by Pages/AIRuler/ResultModel.razor

(function () {
    window.hkAirulerStats = window.hkAirulerStats || {};

    function setError(el, msg) {
        if (!el) return;
        el.innerHTML = '<div class="text-danger small">' + msg + '</div>';
    }

    function getTarget(divId) {
        const el = document.getElementById(divId);
        if (!el) {
            console.error('[hkAirulerStats] Target element not found:', divId);
            return null;
        }
        return el;
    }

    function hasPlotly() {
        return typeof Plotly !== 'undefined' && Plotly && typeof Plotly.newPlot === 'function';
    }

    // payload (camelCase)
    // {
    //   title: string,
    //   gt: number|null,
    //   tol: number|null,
    //   films: [{ film: number, label: string, values: number[] }]
    // }
    window.hkAirulerStats.renderBoxPlot = function (divId, payload) {
        const el = getTarget(divId);
        if (!el) return;

        if (!hasPlotly()) {
            setError(el, 'Plotly.js is not loaded. Check Pages/_Layout.cshtml script includes.');
            return;
        }

        const films = (payload && payload.films) ? payload.films : [];
        if (!films.length) {
            setError(el, 'No data to plot.');
            return;
        }

        // traces: one box per film
        const traces = films.map(f => {
            const ys = Array.isArray(f.values) ? f.values : [];
            return {
                y: ys,
                type: 'box',
                name: f.label || ('Film #' + (f.film ?? '')),
                boxpoints: 'all', // show all points
                jitter: 0.35,
                pointpos: 0,
                marker: { size: 6, opacity: 0.75 },
                line: { width: 1 }
            };
        });

        // GT and tolerance lines
        const shapes = [];
        const gt = payload ? payload.gt : null;
        const tol = payload ? payload.tol : null;

        function addHLine(y, width, color, dash) {
            shapes.push({
                type: 'line',
                xref: 'paper',
                x0: 0,
                x1: 1,
                yref: 'y',
                y0: y,
                y1: y,
                line: {
                    width: width,
                    color: color,
                    dash: dash || 'solid'
                }
            });
        }

        if (typeof gt === 'number' && !isNaN(gt)) {
            // GT line (thick)
            addHLine(gt, 4, '#d62728', 'solid');

            if (typeof tol === 'number' && !isNaN(tol) && tol > 0) {
                // tolerance lines (dashed)
                addHLine(gt + tol, 2, '#ff7f0e', 'dash');
                addHLine(gt - tol, 2, '#ff7f0e', 'dash');
            }
        }

        const layout = {
            title: payload && payload.title ? { text: payload.title, font: { size: 14 } } : undefined,
            margin: { t: 40, r: 16, b: 40, l: 60 },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white',
            showlegend: false,
            shapes: shapes,
            xaxis: {
                automargin: true,
                title: ''
            },
            yaxis: {
                automargin: true,
                zeroline: false
            }
        };

        const config = {
            responsive: true,
            displayModeBar: true
        };

        Plotly.newPlot(el, traces, layout, config);
    };

    window.hkAirulerStats.purge = function (divId) {
        const el = document.getElementById(divId);
        if (!el) return;

        if (hasPlotly()) {
            try { Plotly.purge(el); } catch (e) { /* ignore */ }
        }
        el.innerHTML = '';
    };
})();

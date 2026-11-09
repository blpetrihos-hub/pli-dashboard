/* PLI public explainer — Chart.js boot with embedded data fallback */
(function () {
  const COLORS = {
    baseline: "#1f3b6e",
    post: "#7a4b00",
    favFill: "rgba(15, 107, 53, 0.32)",
    unfavFill: "rgba(176, 74, 74, 0.28)",
    t0: "#115740",
  };

  let data = null;
  let pathChart = null;
  let trendChart = null;
  let pluginsReady = false;

  function setStatus(msg, isError) {
    const el = document.getElementById("chartStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.toggle("error", !!isError);
  }

  function ensurePlugins() {
    if (pluginsReady || typeof Chart === "undefined") return;
    const betweenFillPlugin = {
      id: "betweenFill",
      beforeDatasetsDraw(chart, _args, opts) {
        try {
          const { ctx, chartArea, data } = chart;
          if (!chartArea) return;
          const bi = opts.baselineIndex ?? 0;
          const pi = opts.postIndex ?? 1;
          const lowerIsFavorable = !!opts.lowerIsFavorable;
          const baseMeta = chart.getDatasetMeta(bi);
          const postMeta = chart.getDatasetMeta(pi);
          const baseVals = data?.datasets?.[bi]?.data;
          const postVals = data?.datasets?.[pi]?.data;
          if (!baseMeta?.data?.length || !postMeta?.data?.length) return;
          if (!Array.isArray(baseVals) || !Array.isArray(postVals)) return;

          ctx.save();
          ctx.beginPath();
          ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
          ctx.clip();

          for (let i = 0; i < baseMeta.data.length - 1; i++) {
            const b0 = baseMeta.data[i];
            const b1 = baseMeta.data[i + 1];
            const p0 = postMeta.data[i];
            const p1 = postMeta.data[i + 1];
            if (
              ![b0, b1, p0, p1].every(
                (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && !p.skip
              )
            ) {
              continue;
            }
            const by0 = Number(baseVals[i]);
            const by1 = Number(baseVals[i + 1]);
            const py0 = Number(postVals[i]);
            const py1 = Number(postVals[i + 1]);
            if (![by0, by1, py0, py1].every(Number.isFinite)) continue;

            const bAvg = (by0 + by1) / 2;
            const pAvg = (py0 + py1) / 2;
            const fav = lowerIsFavorable ? pAvg <= bAvg : pAvg >= bAvg;

            ctx.beginPath();
            ctx.moveTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p0.x, p0.y);
            ctx.closePath();
            ctx.fillStyle = fav ? COLORS.favFill : COLORS.unfavFill;
            ctx.fill();
          }
          ctx.restore();
        } catch (_err) {
          // Never abort Chart.js draw if the fill plugin fails.
        }
      },
    };

    const t0Plugin = {
      id: "t0Marker",
      afterDatasetsDraw(chart, _args, opts) {
        try {
          const idx = opts.index;
          if (idx == null || idx < 0) return;
          const meta = chart.getDatasetMeta(0);
          const pt = meta?.data?.[idx];
          if (!pt || !Number.isFinite(pt.x) || !chart.chartArea) return;
          const { top, bottom } = chart.chartArea;
          const ctx = chart.ctx;
          ctx.save();
          ctx.strokeStyle = COLORS.t0;
          ctx.lineWidth = 1.25;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pt.x, top);
          ctx.lineTo(pt.x, bottom);
          ctx.stroke();
          ctx.fillStyle = COLORS.t0;
          ctx.font = "600 12px Segoe UI, Arial, sans-serif";
          ctx.fillText("t₀", pt.x + 5, top + 14);
          ctx.restore();
        } catch (_err) {
          // ignore marker failures
        }
      },
    };

    Chart.register(betweenFillPlugin, t0Plugin);
    pluginsReady = true;
  }

  function lineDatasets(baseline, post) {
    return [
      {
        label: "Baseline",
        data: baseline,
        borderColor: COLORS.baseline,
        borderDash: [7, 5],
        backgroundColor: "transparent",
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2.5,
        tension: 0.22,
      },
      {
        label: "Post-action",
        data: post,
        borderColor: COLORS.post,
        backgroundColor: "transparent",
        pointRadius: 2.5,
        pointHoverRadius: 5,
        borderWidth: 3,
        tension: 0.25,
      },
    ];
  }

  function commonOptions(yTitle, pluginOpts) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: { usePointStyle: true, boxWidth: 10, color: "#1a1f1c" },
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(2)}`,
          },
        },
        betweenFill: pluginOpts.betweenFill || {},
        t0Marker: pluginOpts.t0Marker || { index: null },
      },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9, color: "#5a5f6e" },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
        y: {
          grace: "8%",
          title: { display: true, text: yTitle, color: "#5a5f6e" },
          ticks: { color: "#5a5f6e" },
          grid: { color: "rgba(0,0,0,0.08)" },
        },
      },
    };
  }

  function buildPathChart() {
    const labels = data.meta.quarters;
    const { baseline, post_action, unit } = data.path_cartoon;
    const canvas = document.getElementById("pathChart");
    if (!canvas) return;
    if (pathChart) pathChart.destroy();
    pathChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets: lineDatasets(baseline, post_action) },
      options: commonOptions(unit, {
        betweenFill: {
          baselineIndex: 0,
          postIndex: 1,
          lowerIsFavorable: false,
        },
        t0Marker: { index: data.meta.t0_index },
      }),
    });
  }

  function buildTrendChart(indicatorId) {
    const ind =
      data.indicators.find((x) => x.id === indicatorId) || data.indicators[0];
    document.querySelectorAll(".toggles button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.id === ind.id);
    });
    const labelEl = document.getElementById("exampleLabel");
    if (labelEl) labelEl.textContent = ind.example;

    const canvas = document.getElementById("trendChart");
    if (!canvas) return;
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: data.meta.quarters,
        datasets: lineDatasets(ind.baseline, ind.post_action),
      },
      options: commonOptions(ind.label, {
        betweenFill: {
          baselineIndex: 0,
          postIndex: 1,
          lowerIsFavorable: !!ind.lower_is_favorable,
        },
        t0Marker: { index: data.meta.t0_index },
      }),
    });
  }

  function wireToggles() {
    const host = document.getElementById("indicatorToggles");
    if (!host) return;
    host.innerHTML = "";
    data.indicators.forEach((ind) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = ind.id;
      btn.textContent = ind.label
        .replace(" (%)", "")
        .replace(" rate", "")
        .replace(" growth", "");
      btn.addEventListener("click", () => buildTrendChart(ind.id));
      host.appendChild(btn);
    });
  }

  function renderAll() {
    ensurePlugins();
    wireToggles();
    buildPathChart();
    buildTrendChart("invest");
    setStatus("");
  }

  function loadData() {
    if (window.PLI_DEMO) {
      data = window.PLI_DEMO;
      return Promise.resolve(data);
    }
    return fetch("data/demo_trends.json")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((json) => {
        data = json;
        return data;
      });
  }

  function waitForChart(attemptsLeft) {
    if (typeof Chart !== "undefined") {
      return Promise.resolve();
    }
    if (attemptsLeft <= 0) {
      return Promise.reject(new Error("Chart.js failed to load"));
    }
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        waitForChart(attemptsLeft - 1).then(resolve, reject);
      }, 50);
    });
  }

  function boot() {
    setStatus("Loading charts…");
    waitForChart(40)
      .then(loadData)
      .then(renderAll)
      .catch((err) => {
        console.error(err);
        setStatus(
          "Charts could not load. Check that Chart.js and demo data are available.",
          true
        );
        const el = document.getElementById("exampleLabel");
        if (el) el.textContent = "Demo data unavailable.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

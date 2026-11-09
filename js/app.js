/* PLI public explainer charts */
(function () {
  const COLORS = {
    baseline: "#1f3b6e",
    post: "#7a4b00",
    favFill: "rgba(15, 107, 53, 0.30)",
    unfavFill: "rgba(176, 74, 74, 0.26)",
    t0: "#115740",
  };

  let data = null;
  let pathChart = null;
  let trendChart = null;

  const betweenFillPlugin = {
    id: "betweenFill",
    beforeDatasetsDraw(chart, _args, opts) {
      const { ctx, chartArea, scales } = chart;
      const bi = opts.baselineIndex ?? 0;
      const pi = opts.postIndex ?? 1;
      const lowerIsFavorable = !!opts.lowerIsFavorable;
      const baseMeta = chart.getDatasetMeta(bi);
      const postMeta = chart.getDatasetMeta(pi);
      if (!baseMeta.data.length || !postMeta.data.length) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
      ctx.clip();

      for (let i = 0; i < baseMeta.data.length - 1; i++) {
        const b0 = baseMeta.data[i];
        const b1 = baseMeta.data[i + 1];
        const p0 = postMeta.data[i];
        const p1 = postMeta.data[i + 1];
        if ([b0, b1, p0, p1].some((p) => !p || p.skip)) continue;
        const midFavorable = lowerIsFavorable
          ? (p0.y + p1.y) / 2 >= (b0.y + b1.y) / 2 // canvas y down: higher y = lower value
          : (p0.y + p1.y) / 2 <= (b0.y + b1.y) / 2;
        // For lowerIsFavorable unemployment: lower value = higher on chart = smaller y
        // Favorable when post value < baseline value => post.y > baseline.y in canvas
        const fav = lowerIsFavorable
          ? (p0.parsed.y + p1.parsed.y) / 2 <= (b0.parsed.y + b1.parsed.y) / 2
          : (p0.parsed.y + p1.parsed.y) / 2 >= (b0.parsed.y + b1.parsed.y) / 2;

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
    },
  };

  const t0Plugin = {
    id: "t0Marker",
    afterDatasetsDraw(chart, _args, opts) {
      const idx = opts.index;
      if (idx == null) return;
      const meta = chart.getDatasetMeta(0);
      const pt = meta.data[idx];
      if (!pt) return;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = COLORS.t0;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pt.x, top);
      ctx.lineTo(pt.x, bottom);
      ctx.stroke();
      ctx.fillStyle = COLORS.t0;
      ctx.font = "600 12px Segoe UI, Arial";
      ctx.fillText("t0", pt.x + 5, top + 14);
      ctx.restore();
    },
  };

  Chart.register(betweenFillPlugin, t0Plugin);

  function lineDatasets(baseline, post) {
    return [
      {
        label: "Baseline",
        data: baseline,
        borderColor: COLORS.baseline,
        borderDash: [7, 5],
        backgroundColor: "transparent",
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.22,
      },
      {
        label: "Post-action",
        data: post,
        borderColor: COLORS.post,
        backgroundColor: "transparent",
        pointRadius: 0,
        borderWidth: 2.6,
        tension: 0.25,
      },
    ];
  }

  function commonOptions(yTitle, pluginOpts) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top" },
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
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          grid: { color: "rgba(0,0,0,0.04)" },
        },
        y: {
          title: { display: true, text: yTitle },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
    };
  }

  function buildPathChart() {
    const labels = data.meta.quarters;
    const { baseline, post_action, unit } = data.path_cartoon;
    const ctx = document.getElementById("pathChart");
    if (pathChart) pathChart.destroy();
    pathChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: lineDatasets(baseline, post_action) },
      options: commonOptions(unit, {
        betweenFill: { baselineIndex: 0, postIndex: 1, lowerIsFavorable: false },
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

    const labels = data.meta.quarters;
    const ctx = document.getElementById("trendChart");
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
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
    host.innerHTML = "";
    data.indicators.forEach((ind) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = ind.id;
      const short = ind.label
        .replace(" (%)", "")
        .replace(" rate", "")
        .replace(" growth", "");
      btn.textContent = short;
      btn.addEventListener("click", () => buildTrendChart(ind.id));
      host.appendChild(btn);
    });
  }

  function boot() {
    fetch("data/demo_trends.json")
      .then((r) => r.json())
      .then((json) => {
        data = json;
        wireToggles();
        buildPathChart();
        buildTrendChart("invest");
      })
      .catch((err) => {
        console.error(err);
        const el = document.getElementById("exampleLabel");
        if (el) el.textContent = "Could not load demo data.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Chart.js loaded with defer; wait a tick
      setTimeout(boot, 0);
    });
  } else {
    setTimeout(boot, 0);
  }
})();

"use strict";
const pages = window.HYPERBENCH_PAGES;
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function catalogue() {
  const mount = document.querySelector("#case-catalogue");
  if (!mount) return;
  const cases = window.HYPERBENCH_CASES;
  const families = [...new Set(cases.map((c) => c.family))];
  mount.innerHTML = families
    .map((f) => {
      const rows = cases.filter((c) => c.family === f);
      return `<details><summary>${escapeHTML(f)} · ${rows.length} 个场景</summary>${rows
        .map(
          (c) =>
            `<h4>${escapeHTML(c.name)}</h4><div class="table-wrap"><table><tbody>${[
              ["Suite / Reference tier", c.suite + " / " + c.reference_tier],
              ["方程 / 初态", c.equation + " / " + c.initial],
              ["边界 / 区域", c.boundary + " / " + JSON.stringify(c.bounds)],
              ["参数", JSON.stringify(c.params)],
              ["原始时间序列", c.times.join(", ")],
              ["目录网格", c.grids.join(", ")],
              ["参考构造", c.reference],
            ]
              .map(
                ([k, v]) =>
                  `<tr><th>${k}</th><td><code>${escapeHTML(v)}</code></td></tr>`,
              )
              .join("")}</tbody></table></div>`,
        )
        .join("")}</details>`;
    })
    .join("");
}
const nav = document.querySelector("#chapters");
nav.innerHTML = pages
  .map((p) => `<a href="#${p.id}" data-page="${p.id}"${p.parent ? ' class="subchapter"' : ""}>${p.title}</a>`)
  .join("");
function render() {
  let id = location.hash.slice(1) || "overview";
  // Preserve published links after merging the two model walkthrough pages.
  if (id === "cost-machine" || id === "cost-example") {
    id = "cost-walkthrough";
    history.replaceState(null, "", "#" + id);
  }
  if (id === "content") return;
  const p = pages.find((p) => p.id === id) || pages[0];
  const i = pages.indexOf(p);
  document.title = `${p.title} · Hyperbench 文档`;
  document.querySelector("#content").innerHTML =
    `<div class="tag">${p.eyebrow}</div>${p.html}<div class="page-foot">${i ? `<a href="#${pages[i - 1].id}">← ${pages[i - 1].title}</a>` : "<span></span>"}${i < pages.length - 1 ? `<a href="#${pages[i + 1].id}">${pages[i + 1].title} →</a>` : '<a href="#overview">返回概览</a>'}</div>`;
  catalogue();
  nav
    .querySelectorAll("a")
    .forEach((a) =>
      a.dataset.page === p.id
        ? a.setAttribute("aria-current", "page")
        : a.removeAttribute("aria-current"),
    );
  document.querySelector("#revision").textContent =
    window.HYPERBENCH_REVISION || "文档 / 2026-09-22";
  document.querySelectorAll("pre").forEach((pre) => {
    const wrap = document.createElement("div");
    wrap.className = "code";
    pre.before(wrap);
    const bar = document.createElement("div");
    bar.className = "code-top";
    bar.innerHTML = `<span>${pre.dataset.lang || "CODE"}</span><button type="button" class="copy">复制代码</button>`;
    wrap.append(bar, pre);
    bar.querySelector("button").onclick = async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent);
        bar.querySelector("button").textContent = "已复制";
      } catch {
        document.querySelector("#notice").textContent =
          "无法访问剪贴板，请选择代码手动复制。";
      }
    };
  });
}
window.addEventListener("hashchange", () => {
  render();
  document.querySelector("#content").focus({ preventScroll: true });
  document.querySelector(".workspace").scrollIntoView({ block: "start" });
});
render();

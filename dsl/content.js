'use strict';
const SOURCE='https://github.com/NOrangeeroli/meta-pde-solver/blob/7b302f507d3ef6707be63ff099b91376a6573adb/';
const chapters=[['overview','全局图景'],['hierarchy','五层组件拆分'],['simple-solver','算例：拆开一个 solver'],['equations','跨方程共享结构'],['dsl','DSL 与类型契约'],['supernet','L1 / L2 Supernet'],['training','梯度与多网格训练'],['e2e-training','完整轨迹 E2E 训练'],['controllers','CFL、拒步与回退'],['budget','成本预算与剪枝'],['quickstart','从代码开始'],['sources','范围与实现来源']];
const flow=(items)=>`<div class="flow">${items.map((x,i)=>`${i?'<span class="arrow" aria-hidden="true">→</span>':''}<div class="node ${['teal','blue','purple','amber'][i%4]}"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>`;
const head=(n,k,t,p)=>`<p class="section-label">${n} / ${k}</p><h2>${t}</h2><p class="lead">${p}</p>`;
const pages={overview:()=>head('01','OVERVIEW','搜索的是数值算法的组合。','把经典 solver 写成能逐层展开的计算图，在兼容的接口上放入候选模块，再通过数据选择结构和参数。')+`
<div class="diagram"><div class="diagram-head"><p class="label">ONE PROGRAM · TWO DIRECTIONS</p><span class="chip">前向计算 / 反向学习</span></div>${flow([['拆分 solver','L0 → L1 → L2 → L3 → L4'],['定义 supernet','候选模块 + 共享 gate'],['在数据上训练','误差 + 稀疏化 + 成本'],['导出硬 solver','单选路径 + 独立验证']])}<div class="return-line">← 参考解与预算约束，把梯度传回选择权重 α 和内部参数 θ</div><p class="caption">图 01 · 分层规定如何表示；mixture 规定在哪里搜索；训练决定保留哪些组合。</p></div>
<div class="grid2"><a class="card" href="#hierarchy"><span class="tag">01 / REPRESENTATION</span><h4>一个 WENO 步，能拆到多细？</h4><p>从时间步到数值模块、机制、模板和张量原语。逐层查看各层输入与输出。</p></a><a class="card" href="#supernet"><span class="tag">02 / SEARCH SPACE</span><h4>L1 与 L2，改变的是什么？</h4><p>L1 在完整重构方法间选择；L2 在 WENO 权重、MP5 限幅等内部机制间组合。</p></a><a class="card" href="#training"><span class="tag">03 / OPTIMIZATION</span><h4>模块与参数一起学</h4><p>共享 gate 和内部参数跨网格训练；controller 各自 rollout，然后组合损失。</p></a><a class="card" href="#budget"><span class="tag">04 / DEPLOYMENT</span><h4>混合表现 ≠ 剪枝表现</h4><p>导出单选路径后重新测量误差、拒步和成本，最后进入 HyperBench。</p></a></div>
<h3>三个范围，需要分别理解</h3><div class="table-wrap"><table><thead><tr><th>对象</th><th>已实现的含义</th><th>不能据此推断</th></tr></thead><tbody><tr><td>五层组件 / DSL</td><td>宏可展开，候选可组合，L4 Torch 执行</td><td>任意组合都稳定或物理合法</td></tr><tr><td>18 个默认方程入口</td><td>每个方程有可训练的基础 FV 搜索空间</td><td>每个方程都覆盖全部经典 solver</td></tr><tr><td>Burgers 64 配置</td><td>冻结目录中 64 个固定步长数值路径有见证</td><td>原生自适应控制器全部等价</td></tr></tbody></table></div><div class="note">本指南的既有实现章节按代码快照 <code>7b302f507</code> 编写；<a href="#e2e-training">完整轨迹 E2E 训练</a> 是另列的设计方案。交互图用于解释结构和公式，不在浏览器里运行 PDE 训练，也不展示虚构的实验性能。</div>`};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const code=(title,s)=>`<div class="codebox"><div class="code-head"><span>${title}</span><button class="copy" aria-label="复制 ${title}">复制</button></div><pre><code>${esc(s)}</code></pre></div>`;
const table=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const levelData=[
{title:'完整时间步',sub:'选择整个算法 / 调度',intro:'L0 表示从当前状态到下一状态的完整一步。FV、Classic、SharpClaw、DG 的拓扑可以不同，不必硬塞进一个 FV 模板。',tokens:['uⁿ','SSPRK3 step','uⁿ⁺¹'],formula:'u¹ = uⁿ + Δt L(uⁿ)\nu² = ¾uⁿ + ¼[u¹ + Δt L(u¹)]\nuⁿ⁺¹ = ⅓uⁿ + ⅔[u² + Δt L(u²)]',next:'下一层：每一个 L(u) 由重构、通量、散度组成；时间阶段由仿射组合组成。',ports:'输入：状态、Δt、Δx；输出：下一时刻状态。'},
{title:'数值模块',sub:'重构 / 通量 / 散度 / 阶段',intro:'L1 是可直接识别的数值模块。以有限体积为例，先构造界面左右迹，再计算共享界面通量，最后组装守恒残差。',tokens:['reconstruct','flux','divergence','RK stage'],formula:'ū → (u⁻, u⁺) → F̂ᵢ₊½\nL(ūᵢ) = −(F̂ᵢ₊½ − F̂ᵢ₋½) / Δx',next:'下一层：WENO 重构展开成候选多项式、平滑度、非线性权重与加权组合。通量展开成中心项和耗散等机制。',ports:'接口：cell mean → face traces → face flux → cell residual。'},
{title:'数值机制',sub:'候选 / 平滑度 / 权重 / 限幅',intro:'L2 打开模块内部。WENO5 的模板预测不变时，可以只搜索如何由平滑度得到归一化权重；MP5 可以把五阶预测与限幅机制拆开。',tokens:['q₀, q₁, q₂','β₀, β₁, β₂','ω = normalize(α)','Σ ωₖ qₖ'],formula:'αₖ = dₖ / (ε + βₖ)²  [JS]\nωₖ = αₖ / Σⱼ αⱼ\nu⁻ᵢ₊½ = Σₖ ωₖ qₖ',next:'下一层：候选值成为 stencil 的线性组合；β 成为差分的平方和；归一化成为受保护的比值与聚合。',ports:'接口：同一 stencil → 候选值 / 无量纲权重 → 界面迹。'},
{title:'离散与代数构件',sub:'模板读取 / 线性组合 / 聚合',intro:'L3 不再选择一个有名字的 WENO 算法，而是描述局部离散运算：读哪个邻居、按哪些系数相加、如何保护分母、如何限幅。',tokens:['shift(u, −2…2)','linear combination','square / ratio','weighted sum'],formula:'q₀ = ⅓uᵢ₋₂ − ⁷⁄₆uᵢ₋₁ + ¹¹⁄₆uᵢ\nβ₀ = ¹³⁄₁₂(uᵢ₋₂−2uᵢ₋₁+uᵢ)²\n     + ¼(uᵢ₋₂−4uᵢ₋₁+3uᵢ)²',next:'下一层：模板读取变成张量索引；线性组合与平方展开成 mul/add；分支展开成比较与 where。',ports:'接口：固定位置的浮点场与系数；显式保留 stencil 依赖。'},
{title:'Torch 执行原语',sub:'索引 / 算术 / 比较 / 选择',intro:'L4 是终端层。所有宏最终在这里执行，由 PyTorch 构建 autograd 图。无需把每个高层 solver 再手写一份 Torch 实现。',tokens:['index / gather','add / mul / div','abs / max / exp','where / reduce'],formula:'x = index(u, stencil)\ny = add(mul(c₀, x₀), mul(c₁, x₁))\nloss.backward()  →  ∂loss/∂α, ∂loss/∂θ',next:'L4 不再向下拆分。不能把完整 solver 或 Python 回调伪装成一个“原语”。',ports:'接口：dtype/device 一致的张量；参数仍引用同一个 nn.Parameter。'}];
pages.hierarchy=()=>head('02','HIERARCHY','五层表示，逐层展开。','层级是数值抽象的粒度，不是神经网络的深度。这里先展开数值一步内核；完整 solver 还包含选步、接受与重试，详见「CFL、拒步与回退」的控制分层。点击一层查看 WENO5 + SSPRK3 的内核。')+`
<div class="diagram"><div class="diagram-head"><p class="label">EXPLORE A NUMERICAL STEP</p><span class="chip">交互 · 选择层级</span></div><div class="level-layout"><div class="level-list" aria-label="选择组件层级">${levelData.map((x,i)=>`<button data-level="${i}" aria-pressed="${i===1}"><b>L${i}</b>${x.title}<small>${x.sub}</small></button>`).join('')}</div><div id="level-detail" class="detail-panel" aria-live="polite"></div></div><p class="caption">图 02 · 展示概念依赖而非全部节点；宏命名与不同 solver 的具体图形以注册表和序列化图为准。</p></div>
<h3>展开保持算法，替换候选改变算法</h3>${flow([['lower(graph, 2)','展开到机制层，数值语义应保留'],['插入 Choice','定义合法的替换点与候选集合'],['lower(graph, 4)','仍由同一套 Torch 原语执行']])}
<div class="note">对于 L0–L3 的每个注册宏，展开规则只引入下一层节点；原输入端口是边界，input/const 是各层都可用的语言原子。L4 是明确终点。展开正确性与独立数值正确性需要分别测试。</div>
<h3>从真实接口检查展开</h3>${code('Python · 一个 Burgers 数值步',`import torch
from solver_sculpt.hierarchy import (
    SolverSpec, build, lower, evaluate,
)

spec = SolverSpec(reconstruction="weno5_js", flux="godunov")
graph = build(spec)
mechanisms = lower(graph, 2)
primitives = lower(graph, 4)
u = torch.zeros(2, 32, dtype=torch.float64)
v = evaluate(primitives, {"u": u, "dt_dx": 0.01})`)}
<details><summary>为什么不是把每一个高层组件都重新写成 Torch？</summary><p>高层组件是构图规则，最终指向已有 L4 Torch 操作。改用更细的搜索粒度时，展开图即可；训练参数通过引用保持身份，不复制、不 detach。只有引入新的底层操作时，才需要增加对应执行实现与梯度检查。</p></details>`;
pages.equations=()=>head('04','CROSS-EQUATION','共享结构，显式保留物理差异。','方程提供物理通量、波速和状态语义；几何与数值模块提供重构、残差和时间更新。共享接口不等于可以随意混用不同方程的通量。')+`
<div class="diagram"><div class="diagram-head"><p class="label">EQUATION × NUMERICAL PROGRAM</p><span class="chip">交互 · 切换物理模型</span></div><div class="controls"><label for="equation-select">物理模型</label><select id="equation-select"><option value="burgers">Burgers</option><option value="euler">Euler · 理想气体</option><option value="shallow">浅水 · 平底</option></select></div><div id="physics-panel" aria-live="polite"></div>${flow([['状态与物理通量','equation-specific'],['重构与界面方法','compatible candidates'],['守恒残差与时间步','shared composition']])}<p class="caption">图 03 · 切换方程会改变状态宽度、波速与物理约束，但沿用分层组合的方法。</p></div>
<h3>默认入口覆盖 18 个方程 ID</h3>${table(['类别','方程 ID','必须保留的差异'],[['标量','advection / advection2d / burgers / kpp2d','线性与非线性通量、空间方向'],['波系统','acoustics / acoustics2d / elastic / maxwell / nonlinear_elastic','变量顺序、材料参数、特征速度'],['流体','euler / euler2d / shallow / shallow2d','密度、压力或水深 admissibility'],['带地形','shallow_bathy','PC 水静力重构与成对地形修正'],['磁流体','mhd / isothermal_mhd','1D、空间恒定的法向磁场与对应 EOS'],['带源项','reactive / relaxation','半源项 → 输运 → 半源项的分裂结构']])}
<div class="note">这些 default supernets 主要采用 FV + SSPRK3。一般重构候选为 PC / MUSCL MC / WENO5-JS，通量候选为 local / line-global / learned LLF；<code>shallow_bathy</code> 固定 PC 水静力重构。它们比 Burgers catalogue 的完整搜索空间更窄。</div>
${code('Python · 跨方程默认 supernet',`import torch
from solver_sculpt.hierarchy.default_supernets import build_default_supernet

net = build_default_supernet(
    "euler2d", parameters={"gamma": 1.4},
    initialization="baseline", sparse=True, dtype=torch.float64,
)
# u: [B, 4, Ny, Nx]，每个空间轴至少 6 个单元
# 分量为 rho, rho*u, rho*v, E；输入必须物理可容许。
# next_u = net(u=u, dt=0.001, dx=0.02, dy=0.02)`)}
<h3>数据布局也是契约的一部分</h3>${table(['接口','布局','组合时的规则'],[['默认标量 / 系统','[B,N] / [B,C,N]；2D 追加 Ny,Nx','空间轴在最后，状态分量紧邻空间轴之前'],['Burgers catalogue','[B,3,N] 增广状态','mean、DG slope、初始 LF speed；每条轨迹只初始化一次'],['programs.Recipe 前端','[cells,components]','与空间轴在末尾的训练前端不同；必须显式转换，不能直接混接']])}
<p class="small">跨方程复用的是表示语言与模块组合原则。干湿界面、源项平衡、真空、材料变化、MHD 约束等需要单独的兼容性与数值验证。</p>`;
pages.dsl=()=>head('05','DSL','DSL = 数值图 + 选择节点 + 参数引用。','这是嵌入 Python 的构图语言，不是另一门需要解析的文本语言。模型保留带 Choice 的源图，再逐层展开到 Torch 执行图。')+`
<div class="diagram">${flow([['数值候选','Node：经典公式或组件组合'],['Choice + Contract','同位置、同物理量、同 shape'],['TorchProgram','共享参数与源图元信息'],['L4 执行图','autograd 与序列化回放']])}<p class="caption">图 04 · Choice 是图节点。level 决定它处于哪一层；id 决定多个位置是否共用一个选择。</p></div>
<h3>定义一个真实的 L1 重构选择</h3>${code('Python · 可直接运行的 Choice 示例',`import torch
from solver_sculpt.hierarchy.ir import input
from solver_sculpt.hierarchy.modules import module
from solver_sculpt.hierarchy.trainable import Choice, MixContract, TorchProgram

u = input("u")
candidates = tuple(
    module("reconstruct", u, method=name, side="left")
    for name in ("pc", "muscl_mc", "weno5_js")
)
trace = Choice(
    candidates, id="reconstruction", level=1, sparse=True,
    contract=MixContract("burgers", "face", "trace"),
)
net = TorchProgram(trace, parameter_values={}).double()
u0 = torch.linspace(0.1, 0.8, 16, dtype=torch.float64)[None]
left_trace = net(u=u0)
left_trace.square().mean().backward()`)}
<h3>Choice 的三个核心约束</h3><div class="grid2"><div class="card"><span class="tag">CONTRACT</span><h4>候选输出能够相加</h4><p>同 equation、location、quantity；运行时要求浮点场、相同 shape、至少一个空间轴。不能把 face flux 与 cell residual 混成一个 Choice。</p></div><div class="card"><span class="tag">IDENTITY</span><h4>相同 id，共享同一个 gate</h4><p>左右重构、多个 RK 阶段、多个网格使用同一组权重。共享 id 必须保持候选顺序、数量、温度和 contract 一致。</p></div></div>
<div class="note">第三个约束是数值有效性：Contract 声明不是守恒、量纲或稳定性的自动证明。守恒 FV 优先在共享界面通量处混合，再统一取散度。Dense mixture 仍会执行全部候选，零权重不能拯救一个内部已产生 NaN 的 expert。</div>
<h3>可学习参数留在图中</h3>${code('Python · 参数引用，而不是 Python 常数',`from solver_sculpt.hierarchy import ir
from solver_sculpt.hierarchy.trainable import parameter_ref

raw = parameter_ref("log_extra_dissipation")
multiplier = ir.node("p.add", ir.constant(1.0), ir.node("p.exp", raw))
# 在构造 TorchProgram 时传入同名 tensor 初值。
# 实际 catalogue 的 LLF multiplier = 1 + exp(raw)，初始为 1.2。
# model.parameters() 同时包含 gate 与可学习 expert 参数。`)}
<h3>源图、执行图、导出图</h3>${table(['产物','保留什么','用途'],[['structure_json() + state_dict()','Choice、配置、参数身份与张量值','重新构造模型；优化器状态需另行保存'],['lower / 缓存的 L4 图','张量原语及运行时参数引用','执行与反向传播'],['discretize()','每个 gate 的一个候选；移除死分支','硬模型验证与保留参数微调'],['freeze()','当前确定性混合权重变成常量','单独 freeze 仍可能是混合模型'],['discretize().freeze()','单选、常量化的算术图','数值内核部署；controller 需另存']])}
<p class="small">不要用已经展开的 L4 图重建可训练源模型：它不再携带完整的 architecture metadata。自定义宏必须先注册，再载入结构。</p>`;
pages.supernet=()=>head('06','SUPERNET','先选择算法族，再搜索内部组合。','Burgers catalogue 用 L0 family gate 保留 FV、Classic、SharpClaw、DG 的不同拓扑。mixture_level=1 或 2 改变兼容分支内部的搜索粒度，不把所有 gate 统一到同一层。')+`
<div class="diagram"><div class="diagram-head"><p class="label">HIERARCHICAL SEARCH SPACE</p><div class="seg" aria-label="搜索粒度"><button data-mixture="1" aria-pressed="true">L1 模块级</button><button data-mixture="2" aria-pressed="false">L2 机制级</button></div></div><div class="center-label">u = [mean, DG slope, initial LF speed] → L0 family Choice</div><div class="branch-group"><div class="branch active"><h4>FV</h4><p>trace → flux → divergence → RK</p></div><div class="branch"><h4>Classic</h4><p>Roe waves → wave limiter → correction</p></div><div class="branch"><h4>SharpClaw</h4><p>WENO wave propagation → SSP104 / SSP33</p></div><div class="branch"><h4>DG · P1</h4><p>mean + persistent slope → stage-limited RK3</p></div></div><div class="center-label">↓ 放大 FV 分支中的候选位置</div><div id="mixture-detail" aria-live="polite"></div><p class="caption">图 05 · L2 模式仍含 L1 时间积分等选择。Classic 波限幅不等于 MUSCL 斜率限幅，SharpClaw 也不等于 WENO + LLF。</p></div>
<h3>拖动 gate，观察软组合与硬选择</h3><p>用 PC / MUSCL MC / WENO5-JS 三个候选演示 gate 公式。数字为交互示意，不是训练得到的参数或精度。</p>
<div class="diagram"><div class="diagram-head"><p class="label">DETERMINISTIC GATE DEMO</p><button class="btn" id="reset-gates">重置</button></div><div class="expert-grid">${['PC','MUSCL MC','WENO5-JS'].map((x,i)=>`<div class="expert"><h4>${x}<output id="weight-${i}"></output></h4><label for="logit-${i}">logit α<sub>${i}</sub> <output id="logit-value-${i}"></output></label><input id="logit-${i}" type="range" min="-4" max="4" step="0.1" value="${[-1,0,2][i]}"><label for="rho-${i}">稀疏参数 ρ<sub>${i}</sub> <output id="rho-value-${i}"></output></label><input id="rho-${i}" type="range" min="-6" max="6" step="0.1" value="2"><div class="weight-bar"><i id="bar-${i}"></i></div></div>`).join('')}</div><div class="equation">zₖ = clip(1.2 · sigmoid(ρₖ) − 0.1, 0, 1)<br>wₖ = softmax(α)ₖ · zₖ / Σⱼ softmax(α)ⱼ · zⱼ</div><div id="gate-result" class="result-strip" aria-live="polite"></div><p class="caption">图 06 · 确定性 gate，温度为 1。所有 gate 关闭时回到 softmax；硬导出取最大权重并真正删掉其余分支。</p></div>
<h3>内部参数也一起优化</h3>${table(['位置','L1 模式','L2 模式'],[['重构内部','learned MUSCL θ：初值 1.5，范围 1…2','learned WENO-Z ε：初值 10⁻⁶，范围 10⁻¹⁰…10⁻²'],['LLF 耗散','1 + exp(raw)，初值 1.2','同一参数化'],['gate 范围','全局共享，不随 x 或状态变化','全局共享，不是输入条件化 router']])}
<div class="note warm">这里与 mixture of experts 相似的是候选的加权组合。当前实现是全局 architecture gates，不是为每个单元或输入状态生成不同权重的 router。激活更多专家只扩大可表达范围，不保证训练找到更优 solver。</div>`;
pages.training=()=>head('07','TRAINING','一套参数，在多种分辨率上学习。','数值 gate α、expert 内部参数 θ、controller gate 与有界 CFL 一起优化。跨网格共享同一模型，连续初态和物理输出时刻也保持配对。')+`
<div class="diagram"><div class="diagram-head"><p class="label">REFERENCE → ROLLOUT → GRADIENT</p><span class="chip">同一 θ / α，所有网格</span></div><div class="train-steps">${[['01','采样初态','按 family 平衡抽样，同一批 profile 用于所有 N。'],['02','解析单元平均','在各网格边界上独立积分，不插值粗网格预测。'],['03','分别 rollout','每个 controller 生成完整轨迹，状态不互相混合。'],['04','组合目标','均衡网格误差 + 预算约束 + 稀疏惩罚。'],['05','累积梯度','一条 profile / controller / grid 轨迹一次反传。'],['06','硬导出验证','独立 validation profiles，检查误差与真实计数成本。']].map(x=>`<div class="train-step"><span class="num">${x[0]}</span><b>${x[1]}</b><p>${x[2]}</p></div>`).join('')}</div><div class="return-line">← Adam 更新共享参数；下一轮重复采样与前向计算</div><p class="caption">图 07 · 预算训练实现使用确定性数值 gates，保留梯度但不在每个时间步重新随机采样架构。</p></div>
<h3>同一个函数，不同的单元平均</h3><div class="diagram"><div class="equation">ūᵢ(t) = 1/Δx · ∫<sub>cell i</sub> u(x,t) dx</div>${[32,64,128,256].map((n,i)=>`<div class="grid-lines"><b>N=${n}</b><div class="mesh" aria-label="N=${n} 的网格示意">${Array.from({length:[8,16,32,64][i]},()=>'<i></i>').join('')}</div><span>${i<3?'权重 1/3':'仅迁移评估'}</span></div>`).join('')}<p class="caption">图 08 · 绘制的是缩略网格示意。训练和选模在 32/64/128；256 在选模完成后评估，不参与梯度与 checkpoint 选择。</p></div>
<div class="equation">ℒ<sub>err</sub> = 1/|G| Σ<sub>N∈G</sub> Σ<sub>c</sub> π<sub>c</sub> · NMSE(rollout<sub>c</sub>(θ, α; N), reference<sub>N</sub>)</div><p class="small">每个 profile 的分母为 <code>max(amplitude², 10⁻⁴)</code>。先在每个网格平均时间、单元和 profile 的归一化误差，再等权平均网格；不会让细网格因为单元更多而自动占更大权重。</p>
<h3>三种参数，三条学习路径</h3>${table(['参数','如何影响前向','梯度性质'],[['α / 稀疏 gate ρ','改变各数值 expert 的混合权重','通过各 expert 的 Torch 计算图反传'],['θ：ε、θ-limiter、耗散系数','改变 expert 内部公式','与 architecture 参数共同训练'],['controller logits / CFL raw','改变损失混合权重与候选时间步','CFL 有界；离散拒步与步数处使用路径 / 直通近似']])}
<details><summary>稀疏化为什么不直接用 softmax 权重的 L1？</summary><p>归一化 softmax 权重之和恒为 1，直接做 L1 没有选择作用。数值 gate 使用 Hard-Concrete 活跃数量代理，并计入全关闭时的 dense fallback；预算训练另外对 controller 稀疏参数加惩罚。通用训练态可以采样 logistic noise，本预算训练路径使用确定性数值 gate。</p></details>
<details><summary>解析数据如何覆盖复杂情况？</summary><p>数据源是预先冻结的连续初态清单及其 family、split、amplitude。解析熵解 oracle 在各网格直接生成单元平均，能处理其支持的激波切割单元。初态类型、幅度和最终时刻决定是否包含形成激波、传播、相互作用和长时间行为；短时间窗本身不等于覆盖复杂场景。</p><p>train / validation 通过 profile ID 与连续初态哈希隔离。相同函数禁止跨 split；相似函数的统计泄漏仍需由实验设计处理。默认短时间窗为 0.00390625、0.0078125、0.015625，不应替代长时验证。</p></details>
<div class="note">流式反传与整体损失的梯度在工程测试中对齐。默认每条训练 rollout 最多 256 次尝试；超过上限会失败，不静默截短。分辨率迁移使用 validation profiles 的更细网格，不是独立 test profiles 的泛化测试。</div>`;
pages.controllers=()=>head('09','TIME CONTROL','数值内核之外，还要定义如何推进。','同一个空间离散与 RK 方法，采用不同 CFL、波速估计和拒步策略，会得到不同的误差与成本。控制策略因此也需要进入搜索与导出。')+`
<div class="diagram"><div class="diagram-head"><p class="label">TRANSACTIONAL TIME STEP</p><span class="chip">接受才提交状态与时间</span></div>${flow([['估计速度 a','cell / face / Roe'],['提出 Δt','CFL · Δx/a；截到输出时刻'],['尝试数值步','得到候选状态与阶段诊断'],['检查并接受','finite / stage CFL']])}<div class="return-line">检查失败 → 丢弃候选 → PC 回退或减小 Δt → 从旧状态重试</div><p class="caption">图 09 · rollback 保留旧状态与旧时间。所有尝试、拒步、回退与检查都应计入部署成本。</p></div>
<h3>默认搜索的四条完整策略</h3>${table(['controller','步长 / 检查','失败处理'],[['fixed_1_32','固定 Δt/Δx = 1/32；输出处截断','不重试，失败显式退出'],['cell_cfl','cell speed；CFL 初值 0.2；finite guard','减半重试'],['face_cfl','重构 face speed；CFL 初值 0.35；阶段上限 0.4','减半重试'],['cell_pc_retry','cell speed；CFL 初值 0.2；finite guard','先以 PC 重构重做完整步，再减半']])}
<div class="equation">CFL = c<sub>min</sub> + (c<sub>max</sub> − c<sub>min</sub>) · sigmoid(raw)<br>默认有界范围：[0.01, 0.45]</div>
<h3>Controller mixture 混合的是损失</h3><div class="diagram"><div class="control-flow"><div class="node teal"><b>同一初态 → controller A</b><span>轨迹 A → error A / cost A</span></div><div class="node blue"><b>同一初态 → controller B</b><span>轨迹 B → error B / cost B</span></div></div><div class="center-label">π<sub>A</sub> · loss<sub>A</sub> + π<sub>B</sub> · loss<sub>B</sub> → 更新共享数值模块</div><p class="caption">不在不同时间网格间逐步平均状态；每个样本也独立选择时间步，不被 batch 中最快的波统一拖小步长。</p></div>
<details open><summary>硬导出时，控制器要与算法族兼容</summary><p>先确定数值 family，再从兼容 controller 中选择最高权重者。face / PC fallback 对硬模型要求 FV；fixed / cell 策略通用。导出记录被排除的 incompatible probability mass，不用另一个算法静默替代。</p></details>
<details><summary>与原生 HyperBench 的对齐范围</summary><p>hard Classic 另有 previous-CFL 控制，包含初始 Δt=0.1、target=0.4、max=0.45 与拒步缩放；其原生一致性测试独立存在，但它不在 unrestricted mixed-family 的默认 controller 候选中。</p><p>选定 hard FV 配置的 face-CFL、阶段检查与回滚通过原生对齐测试。软 family mixture 的阶段检查只观察 FV stages；Sharp / DG 完整原生控制、MP5 的局部 invalid-trace fallback 不在这项等价声明内。</p></details>
<p class="small">时间步算术可降到 L4；<code>control_plan</code> 暴露循环、检查与回滚的层级结构。目前外层动态控制由有界 Python runtime 执行，不能把它称为任意控制流 DSL 的通用解释器。</p>`;
pages.budget=()=>head('10','BUDGET & EXPORT','优化软模型，用硬模型决定是否合格。','训练时许多 expert 同时计算；部署时只保留单选路径。预算目标估计部署工作量，不把训练期的全部计算当成最终 solver 的成本。')+`
<div class="diagram">${flow([['软 supernet','全部候选前向 + 可微期望成本'],['独立预算训练','误差 + λ(C/B − 1) + 稀疏项'],['硬剪枝','argmax + compatible controller'],['重新运行','实际尝试计数 + 误差 + 预算']])}<p class="caption">图 10 · λ 通过投影对偶上升更新，始终非负；每个预算 B 分别训练一套模型。</p></div>
<div class="equation">min<sub>θ,α</sub> ℒ<sub>err</sub> + λ(C/B − 1) + ηR<sub>sparse</sub><br>λ ← max(0, λ + lr<sub>dual</sub> · (C/B − 1))</div>
<h3>预算如何影响 checkpoint 选择？</h3><div class="diagram"><div class="diagram-head"><p class="label">FEASIBILITY DEMO · SYNTHETIC VALUES</p><span class="chip">教学示意，无实验结果</span></div><label for="budget-slider">部署预算 B：<output id="budget-value"></output> 个示意单位</label><input id="budget-slider" type="range" min="50" max="200" step="5" value="100"><div id="budget-results" aria-live="polite"></div><p class="caption">图 11 · 先过滤成本超标者，再在合格集合中最小化误差。更低误差但超预算的 checkpoint 不能获选。</p></div>
<h3>我们现在的 C 究竟是什么？</h3>${table(['计入','处理方式'],[['L4 工作量','可达原语节点 × 网格单元数；同一 identity DAG 节点只计一次'],['选择节点','计算共享 choice ID 的 categorical 期望，排除不可达分支'],['时间推进','计入实际尝试、拒步、PC fallback、初始化与 observer 检查'],['多网格','完整物理轨迹的成本，按配置网格等权平均'],['成本梯度','前向用整数计数，反向使用 fractional-attempt 直通代理']])}
<div class="note warm"><code>burgers_identity_dag_work_v1</code> 是结构代理，不是 FLOPs、CPU 秒数或 HyperBench 的规范计算模型。它不做跨独立节点的代数合并，L1/L2 的不同表示可能得到不同成本。离散步数和拒步边界附近的梯度有偏，软成本不能证明硬模型可行。</div>
<h3>从剪枝结果到 benchmark</h3>${flow([['硬验证','独立 profiles 上的 NMSE 与工作量'],['选 checkpoint','预算内最低误差；并列保留最早'],['迁移评估','只在选模后运行更细网格'],['HyperBench','同协议参考解 + 独立重复计时']])}
<p class="small">没有合格 checkpoint 是允许报告的结果。剪枝后可以另行微调保留参数，但必须用新协议再验证，不能将软模型的成绩当成硬 solver 的成绩。是否推进真实 error–time frontier，只能由后续冻结 benchmark 实验判断。</p>`;
const budgetConfig={budgets:[100000,400000,1600000],train_grids:[32,64,128],validation_grids:[32,64,128],transfer_grids:[256],controllers:['fixed_1_32','cell_cfl','face_cfl','cell_pc_retry'],mixture_level:1,initialization:'mp5',steps:600,validate_every:100,per_family:1,learning_rate:0.003,dual_learning_rate:0.05,sparsity_weight:0.00001,gradient_clip:1,seed:0,threads:1,max_steps_per_rollout:20000,max_training_attempts:256};
const smokeCode=`import torch
from solver_sculpt.hierarchy.burgers_catalogue_supernet import (
    build_burgers_catalogue_supernet,
)

torch.manual_seed(0)
net = build_burgers_catalogue_supernet(
    mixture_level=1,  # 改成 2，打开机制级候选
    initialization="mp5", sparse=True, dtype=torch.float64,
)
print(net.named_choices())
print(net.witness("mp5_llf"))

# 一个常值解的 API / 梯度检查；不是科学训练数据。
u0 = torch.full((2, 16), 0.3, dtype=torch.float64)
target = u0[:, None, :].repeat(1, 2, 1)
optimizer = torch.optim.Adam(net.parameters(), lr=0.003)
net.eval()  # 确定性 gate；eval 不关闭 autograd
optimizer.zero_grad()
pred = net.rollout(u0, steps=2, dt=1/512, dx=1/16)
loss = (pred[:, 1:] - target).square().mean()
loss = loss + 1e-5 * net.sparsity_penalty()
loss.backward()
optimizer.step()

hard = net.discretize().eval()
mp5 = net.select_solver("mp5_llf")  # 强制经典见证路径`;
pages.quickstart=()=>head('11','QUICKSTART','从可运行接口，到冻结的训练实验。','运行位置是代码仓库根目录，环境需要 PyTorch 和 NumPy。下面先用常值解检查接口，再准备真正的 Burgers 多网格预算实验。')+`
<div class="note">代码锚定 <code>7b302f507d3ef6707be63ff099b91376a6573adb</code>，分支 <code>codex/burgers-budget-search</code>。需要已有源码仓库访问权限。网页只解释与生成配置，不会在浏览器内启动训练。</div>
<h3>1. 构建 catalogue supernet</h3>${code('Python · 最小工程示例',smokeCode)}
<p class="small"><code>rollout</code> 输出包含初态，shape 为 <code>[B, steps+1, N]</code>。内部初始化增广状态一次，避免每步重置 DG slope 或 frozen LF speed。<code>initialization="mp5"</code> 是软偏置，不等于精确 MP5；直接 builder 的默认初始化为 uniform，预算训练默认显式选择 mp5。</p>
<h3>2. 保存训练配置</h3><div class="controls"><label for="config-level">搜索粒度</label><select id="config-level"><option value="1">L1 模块级</option><option value="2">L2 机制级</option></select><a class="btn" id="download-config" download="search-config.json">下载配置 JSON ↓</a></div><div id="config-code"></div>
<p class="small">默认预算是未校准的起点，单位为完整 rollout 的平均结构工作量。正式对比前，应冻结预算校准、profile 清单、训练与验证 horizon、种子和评价规则。</p>
<h3>3. 准备 → 冻结 → 生成 → 训练 → 回放</h3>${code('Shell · 仓库根目录命令',`# UNIQUE_EXPERIMENT_ID 必须替换为一个新的实验名称。
# 下载的 search-config.json 放到仓库根目录。
python -m solver_sculpt.hierarchy.burgers_budget_search prepare \\
  --experiment experiments/burgers/UNIQUE_EXPERIMENT_ID \\
  --profiles experiments/burgers/20260922_analytic_supernet_v001/results/profiles.json \\
  --config search-config.json \\
  --times 0.00390625 0.0078125 0.015625

# 提交并推送代码、配置、README 和数据协议，核验远端 SHA。
python -m solver_sculpt.hierarchy.burgers_budget_search generate \\
  --experiment experiments/burgers/UNIQUE_EXPERIMENT_ID

# 再提交并推送生成数据与 provenance，保持整个工作区干净。
python -m solver_sculpt.hierarchy.burgers_budget_search run \\
  --experiment experiments/burgers/UNIQUE_EXPERIMENT_ID

python -m solver_sculpt.hierarchy.burgers_budget_search validate \\
  --experiment experiments/burgers/UNIQUE_EXPERIMENT_ID

# 最后补齐同一 README 的结果、分析、限制与决定，提交推送并核验。`)}
<div class="note">prepare 只写协议。generate / run 检查 clean HEAD 与远端一致；新实验目录不得覆盖旧运行。默认短时窗适合起步，不能据此宣称覆盖激波相互作用或长时间稳定性。</div>
<h3>4. 读懂结果文件</h3>${table(['文件 / 目录','含义'],[['data.npz / data_provenance.json','配对解析参考及生成前冻结 SHA、校验和'],['provenance.json','训练前冻结 SHA、数据哈希、Torch 版本与成本模型'],['budget_XX/history.json','逐更新误差、成本、对偶变量、梯度范数和 controller 权重'],['budget_XX/validation_history.json','每次硬导出的可行性和误差；非法候选明确记录'],['budget_XX/selected/','仅有预算可行 checkpoint 时生成：structure、weights、controller'],['summary.json / manifest.json','跨预算汇总与产物字节数 / SHA-256；不是自动生成的科学结论']])}
<details><summary>其他方程如何开始训练？</summary><p>使用 <code>default_supernets</code> 与 <code>search_training</code> 的较窄默认空间，提供 detached 的 train / validation trajectories。该训练器的数据 schema 与 Burgers NPZ 不同：states 包含初态，dt 是观测间隔；必须按各自契约准备。</p>${code('Shell · 通用默认 supernet 入口',`python -m solver_sculpt.hierarchy.search_training \\
  --data train.pt --validation-data validation.pt \\
  --output results/euler2d-search \\
  --epochs 20 --batch-size 8 --rollout-steps 4 \\
  --lr 0.001 --sparsity-weight 0.0001 --cfl 0.2 --seed 0`)}<p>这是接口示例；科学运行同样需要先冻结实验目录、代码、数据和协议。通用训练器没有自动继承 Burgers budget trainer 的多网格和成本控制。</p></details>`;
pages.sources=()=>head('12','SCOPE & SOURCES','让图示与实现保持一致。','既有实现章节解释固定代码快照中的组件与搜索流程；「完整轨迹 E2E 训练」单独记录待验证的新设计。算法可表示、实现通过回归、搜索有效、benchmark 更优，是四个不同的结论。')+`
<div class="diagram">${flow([['可表示','有可选路径与完整展开'],['实现一致','独立 oracle / 梯度 / 回放测试'],['搜索有效','硬模型在独立数据上改进'],['推进 frontier','同 benchmark 协议实测']])}<p class="caption">图 12 · 左侧证据不能自动推出右侧结论。本指南不新增任何训练精度或性能结果。</p></div>
<h3>范围与容易混淆的地方</h3>${table(['陈述','精确解释'],[['64 个 Burgers 配置','冻结 main 目录的 method IDs；含别名与组合，不是 64 种独立理论算法'],['L1 / L2 覆盖','两个 catalogue 搜索空间都能选择这些数值路径；同 Δt、periodic、float64'],['跨方程共享','18 个方程 ID 有基础默认 supernet；不代表每个方程的所有原生 solver / 场景'],['默认初始化','通用 default=baseline；catalogue builder=uniform；budget trainer=mp5'],['controller DSL','时间步算术可展开；动态循环由专用有界 Python runtime 执行'],['Mixture 与稳定性','全局凸权重不自动证明组合后的 TVD、SSP、保正或熵稳定'],['成本','本项目结构 DAG 代理与 HyperBench 成本、wall time 分开解释'],['测试与实验','工程回归用于验证实现，不构成新 solver 的性能结论']])}
<h3>实现入口</h3><ul class="source-list">${[
['solver_sculpt/hierarchy/README.md','五层核心、相邻展开与张量布局'],['solver_sculpt/hierarchy/trainable.py','Choice / MixContract / parameter_ref / TorchProgram'],['docs/hierarchy/trainable-search.md','Gate 语义、序列化与剪枝'],['docs/hierarchy/default-supernets.md','18 个默认方程入口与限制'],['docs/hierarchy/burgers_catalogue/README.md','Burgers L1/L2 候选与 64 配置见证'],['solver_sculpt/hierarchy/burgers_catalogue_supernet.py','Catalogue 构图实现'],['docs/hierarchy/burgers_multigrid_data.md','配对网格数据与解析单元平均'],['docs/hierarchy/burgers_budget_search.md','预算训练与版本化流程'],['solver_sculpt/hierarchy/burgers_control.py','CFL、回滚、回退与控制计划'],['solver_sculpt/hierarchy/burgers_search_cost.py','结构工作量代理实现'],['docs/hierarchy/README.md','programs 前端及跨方程组件扩展']].map(([path,label])=>`<li><a href="${SOURCE+path}" target="_blank" rel="noopener">${label} ↗</a><br><span class="muted mono">${path}</span></li>`).join('')}</ul>
<p class="small">链接指向源码快照 <code>7b302f507d3ef6707be63ff099b91376a6573adb</code>；私有仓库可能需要登录和访问权限。Burgers 64 配置的原生目录来源另冻结于 <code>5a5730a3d3b6bba5acdd053ad5f735a3e7190554</code>；18 个默认方程 ID 的范围源于 <code>9eb7cc373f6065c34ae85882e95c9aa8d526d272</code>。</p>
<h3>参考网站</h3><p><a href="../hyperbench/index.html#overview" target="_blank" rel="noopener">HyperBench · 结构与使用文档 ↗</a></p><p class="small">沿用其侧栏章节、紧凑技术文档与范围说明的组织方式。本站的图示、交互和训练说明针对 Solver Sculpt 实现独立编写。</p>`;
pages['simple-solver']=()=>head('03','A SOLVER, FIVE VIEWS','把一个 Godunov 时间步，拆到张量运算。','只看一个足够简单、可以手算的 solver：一维 Burgers，分片常数重构（PC），Godunov 界面通量，前向 Euler 时间推进。五层描述的是同一个映射，不是连续运行五遍求解器。')+`
<div class="note">固定周期边界、均匀网格、单元平均状态，令 r = Δt/Δx = 0.1。下面给出完整数值内核；时间步由外部指定，不包含 CFL 控制、拒步或训练。</div>
<div class="equation">∂u/∂t + ∂(u²/2)/∂x = 0<br>ūⁿ = [0, 1, 2, 1, 0, −1]　　r = 0.1</div>
<div class="diagram"><div class="diagram-head"><p class="label">SAME STEP · INCREASING DETAIL</p><span class="chip">五层结果应相同</span></div>${flow([['L0 · 一整步','S(ū, r) → ū⁺'],['L1 · 数值模块','PC → Godunov → 更新'],['L2 · 数值机制','零斜率 / 迹 / 通量差'],['L3 · 离散代数','shift / square / linear'],['L4 · 张量原语','索引 / mul / add / max']])}<p class="caption">算例图 A · 箭头表示“打开内部实现”。每次展开保留上一层的输入、输出和算法含义。</p></div>
<section class="walk-level"><span class="walk-badge">L0</span><div><h3>完整一步：先定义 solver 的身份</h3><p>把它看成一个黑盒接口，但内部必须有可展开的定义：给当前单元平均值和步长比，返回下一时刻单元平均值。</p><div class="equation">S<sub>PC, Godunov, Euler</sub>(ūⁿ, r) = ūⁿ⁺¹</div><p class="small"><strong>输入：</strong>[N] 或 [B,N] 的状态与标量 r。<strong>输出：</strong>相同布局的下一状态。这里的算法身份同时包含空间方法、界面方法、时间方法和边界约定。</p><p class="caption">向 L1 展开：完整时间步变成下面四个有明确端口的数值模块。</p></div></section>
<section class="walk-level"><span class="walk-badge">L1</span><div><h3>数值模块：重构 → 通量 → 散度 → Euler</h3><div class="diagram">${flow([['PC 重构','cell → 左右 face traces'],['Godunov 通量','两侧迹 → 一个 face flux'],['守恒增量','相邻通量差 × −r'],['Euler 组合','ū⁺ = ū + 增量']])}</div><div class="equation">(u<sup>L</sup>, u<sup>R</sup>) = reconstruct_PC(ū)<br>Fᵢ = Godunov(u<sup>L</sup>ᵢ, u<sup>R</sup>ᵢ)<br>δuᵢ = −r(Fᵢ − Fᵢ₋₁)<br>ū⁺ᵢ = ūᵢ + δuᵢ</div><p class="small">全文用 <strong>Fᵢ 表示第 i 个单元右边界 i+½ 的通量</strong>。相邻两个单元使用同一个界面通量，一增一减，形成守恒更新。这里 δu 已包含 Δt，不能再乘一次时间步。</p><p class="caption">向 L2 展开：打开 PC、Godunov、散度和仿射更新，不再把整个模块当作基本操作。</p></div></section>
<section class="walk-level"><span class="walk-badge">L2</span><div><h3>数值机制：每个模块里面发生了什么？</h3>${table(['L1 模块','L2 机制','这个算例中的数值'],[['PC 重构','斜率固定为零；从两个相邻单元取左右迹','界面 2+½：uᴸ=2，uᴿ=1'],['Godunov 通量','选择穿过界面的 Burgers 熵解通量','F₂=2；左侧界面 F₁=0.5'],['守恒增量','相邻 face flux 相减，再乘 −r','δu₂=−0.1×(2−0.5)=−0.15'],['Euler 更新','旧状态与增量做系数为 (1,1) 的仿射组合','ū⁺₂=2−0.15=1.85']])}<div class="equation">u<sup>L</sup>ᵢ = ūᵢ + ½ · 0 = ūᵢ<br>u<sup>R</sup>ᵢ = ūᵢ₊₁ − ½ · 0 = ūᵢ₊₁</div><p>对 Burgers 的凸通量，Godunov 通量可以写成以下紧凑公式：</p><div class="equation">G(a,b) = ½ · max(max(a,0)², min(b,0)²)</div><p class="small">这个公式已经包含激波和稀疏波的选择：例如 G(2,1)=2，而跨零稀疏波 G(−1,1)=0。它只适用于这里的标量 Burgers，不能直接用作 Euler 系统的 Godunov 通量。</p><p class="caption">向 L3 展开：迹构造成为邻居读取与线性组合，Godunov 选择成为 max/min/平方，散度成为移位与减法。</p></div></section>
<section class="walk-level"><span class="walk-badge">L3</span><div><h3>离散代数：把局部依赖写出来</h3><p>此时不再需要“重构方法”或“Riemann solver”的名字，只需明确索引、线性组合和标量代数。以下 shift⁺ 定义为读取 uᵢ₊₁，shift⁻ 读取 uᵢ₋₁；周期边界负责首尾连接。</p><div class="diagram"><div class="stencil"><div class="cell">uᵢ₋₁<br>1</div><div class="cell hot">uᵢ<br>2</div><div class="cell">uᵢ₊₁<br>1</div><div class="cell">Fᵢ₋₁<br>0.5</div><div class="cell hot">Fᵢ<br>2</div></div><div class="center-label">共享左、右面通量 → 差值 1.5 → 增量 −0.15 → 新状态 1.85</div><p class="caption">算例图 B · 聚焦 i=2（从 0 编号）。邻居提供界面状态；更新只使用左右两个共享通量。</p></div><div class="equation">a = ū； b = shift⁺(ū)<br>p = max(a, 0)； m = min(b, 0)<br>F = ½ · max(square(p), square(m))<br>δu = −r · [F − shift⁻(F)]<br>ū⁺ = linear(ū, δu; weights=[1,1])</div><p class="caption">向 L4 展开：square(x) → mul(x,x)，linear → mul/add，shift → 周期索引。简单的 max/min 构件也有对应的终端执行原语。</p></div></section>
<section class="walk-level"><span class="walk-badge">L4</span><div><h3>执行原语：最终落到 Torch 张量图</h3><p>下面是等价的、可直接运行的 Torch 表达式，用来阅读和核对数值。实际 IR 执行器通过 p.* 注册原语完成这些操作；代码不是源 IR 的逐节点打印。</p>${code('Python · Godunov + PC + Euler 的等价 L4 计算',`import torch

u = torch.tensor([0., 1., 2., 1., 0., -1.], dtype=torch.float64)
r = 0.1
zero = torch.zeros_like(u)
right = torch.roll(u, shifts=-1, dims=-1)  # right[i] = u[i+1]
pos = torch.maximum(u, zero)
neg = torch.minimum(right, zero)
flux = 0.5 * torch.maximum(pos * pos, neg * neg)
left_flux = torch.roll(flux, shifts=1, dims=-1)
next_u = u - r * (flux - left_flux)

expected = torch.tensor([0., .95, 1.85, 1.15, 0., -.95],
                        dtype=torch.float64)
torch.testing.assert_close(next_u, expected)
torch.testing.assert_close(next_u.sum(), u.sum())
print(flux)    # [0, 0.5, 2, 0.5, 0.5, 0]
print(next_u)  # [0, 0.95, 1.85, 1.15, 0, -0.95]`)}<p class="small">只有索引、比较选择和算术；没有调用隐藏的完整 solver。换成带梯度的参数张量后，autograd 沿这张图传播。L4 是终端层，不继续无限拆分。</p></div></section>
<h3>把整步结果逐项对上</h3>${table(['单元 i','旧值 ūᵢ','左面 Fᵢ₋₁','右面 Fᵢ','增量 δuᵢ','新值 ū⁺ᵢ'],[['0','0','0','0','0','0'],['1','1','0','0.5','−0.05','0.95'],['2','2','0.5','2','−0.15','1.85'],['3','1','2','0.5','+0.15','1.15'],['4','0','0.5','0.5','0','0'],['5','−1','0.5','0','+0.05','−0.95']])}<div class="note">周期边界下，通量差求和抵消，所以本例更新前后的总和都是 3。这个检查验证守恒关系；它不单独证明所有初态、任意步长下的稳定性。这里 r·max|u|=0.2。</div>
<h3>拆开以后，搜索发生在哪里？</h3>${flow([['L1 替换','PC ↔ MUSCL ↔ WENO；Godunov ↔ LLF'],['L2 替换','打开高阶重构后，再选择 slope / weights 等机制'],['保留连接','共享 face flux → 同一散度 → 时间更新']])}<p>将上述可替换位置包进 <code>Choice</code>，才从“固定 solver 的展开图”变成 supernet。PC 本身没有 WENO 权重可以学习；要搜索那类机制，必须先提供包含它的候选结构。</p><p><a href="#dsl">继续看：如何用 DSL 写 Choice →</a></p>`;
// Time-control documentation: verified against the released budget-search runtime.
const controllerOverview = pages.controllers;
pages.controllers = () => controllerOverview() + `
<h3>“调整 CFL”“自适应步长”“搜索步长”是三件事</h3>${table(['概念','当前实现做什么','变化发生在哪里'],[['调整 CFL','每个非 fixed 候选有一个可学习 raw，映射到 [0.01,0.45] 内的 C','训练更新之间；同一个 C 跨 profile、网格和 rollout 步共享'],['自适应 Δt','每步重算速度 a(u)，再用 min(C·Δx/a, remaining)','同一条轨迹的时间步之间；状态变化就可能改变步长'],['搜索 controller','学习整条控制策略的 gate；候选各跑自己的轨迹，组合 loss/cost','架构优化与最终硬选择'],['直接学习每一步 Δt','当前未实现独立的 Δt₀,Δt₁,… 参数向量','不能把现有 CFL 搜索理解为自由时间网格优化'],['拒步 / 回退规则','由所选 ControllerSpec 规定，按实际检查结果执行','当前不是对 retry、speed、guard 分别设置独立 Choice']])}
<div class="diagram"><div class="diagram-head"><p class="label">TWO SHARED PARAMETER PATHS</p><span class="chip">同一个完整 solver</span></div>${flow([['数值结构 α / θ','重构、通量、积分器与内部参数'],['候选控制器 c','策略 gate π，及其 CFL 参数 raw_c'],['独立 rollout_c','Δt 随 u、Δx 和输出边界变化'],['联合目标','误差 + 成本预算 + 稀疏化']])}<div class="return-line">← 梯度更新数值参数、controller gate 和 CFL；重试分支由运行时检查决定</div><p class="caption">控制图 C · 当前是全局策略与 CFL 参数搜索，不是按每个单元输出 CFL 的神经网络 router。fixed_1_32 的比值保持固定，没有可学习 CFL raw。</p></div>
<h3>时间控制如何放进 L0–L4？</h3><p>需要分别看<strong>可执行的步长算术图</strong>与<strong>完整轨迹的控制结构</strong>。前者已经逐层展开并参与执行；后者在当前 Burgers runtime 中有可检查的分层计划，但外层循环仍由 Python 实现。</p>${table(['层级','decision_graph：选一个 Δt','control_plan：管理一条轨迹'],[['L0','control.s.dt：给定波速、CFL、网格、剩余时间，选一步','independent_trajectory_rollouts：逐样本推进'],['L1','control.n.dt：相同策略的模块表示','output_intervals：推进到各个观测时刻'],['L2','control.m.dt：当前所选策略的机制表示','prepare_trial / execute_trial / settle_trial'],['L3','control.a.dt：展开公式、速度保护和输出截断','估速、选步、保存旧状态、检查、提交或恢复'],['L4','p.max / p.mul / p.div / p.min 等执行原语','观察、计数、分支、回滚等动作描述；不是统一张量 IR 的完整执行器']])}
<div class="equation">Δt = min(C · Δx / max(a(u), 10⁻¹⁴), t<sub>out</sub> − t)<br>fixed 策略：Δt = min(Δx / 32, t<sub>out</sub> − t)</div><p class="small">这是 Burgers 当前速度策略的实际公式。Classic previous-CFL 则从 previous_dt 提议开始。decision_graph 的 L0→L1→L2 目前主要传递已选策略，实际算术在 L3→L4 展开；这些层级本身不意味着每个子机制已成为独立搜索 gate。</p>
${code('Python · 检查选步图的五层数值一致性',`import torch
from solver_sculpt.hierarchy import ir
from solver_sculpt.hierarchy.burgers_control import (
    PRESETS, decision_graph, control_plan,
)

spec = PRESETS["cell_cfl"]
graph = decision_graph(spec)
feeds = {key: torch.tensor(value, dtype=torch.float64)
         for key, value in dict(speed=2., cfl=.2, dx=1/6,
                                remaining=.03).items()}
for level in range(5):
    dt = ir.evaluate(ir.lower(graph, level), feeds)
    torch.testing.assert_close(dt, feeds["dx"] * .1)
# dt = 1/60；与下文 Godunov 示例的第一步一致。
plan = control_plan(spec, level=4).to_dict()
# plan 是可检查的控制结构，不是任意控制计划的通用执行入口。`)}
<h3>梯度能经过哪里，哪里只是近似？</h3>${table(['对象','训练中的处理'],[['波速、CFL、Δt 和数值更新','在已经执行的路径上通过 Torch 求导；max/min 切换处不光滑'],['输出时刻截断','remaining 小于建议步长时，min 选择剩余时间，局部梯度路径随之改变'],['accept / reject / 循环次数','布尔判断和步数是离散决策，不对未执行分支求精确梯度'],['成本的实际尝试次数','前向使用整数计数；反向采用 fractional-attempt 直通代理，有偏'],['硬模型预算资格','重新 rollout 后检查实际计数，不拿软代理直接判定可行性']])}
<h3>同名 CFL 组件，不能混为同一套接口</h3>${table(['入口','已实现内容','与当前搜索训练的关系'],[['burgers_control + BudgetSearchModel','终止于输出时刻、拒步 / 回退、可学习 CFL、完整策略 mixture','当前 Burgers 多网格预算训练使用的路径'],['programs.CFLTimeStep','跨 9 个一维均匀方程模型的状态波速选步组件','独立组件；C 是配置参数，不自动成为训练器的 nn.Parameter'],['programs.CFLRollout','编译时固定步数，逐步选 CFL 步长，连接 RK startup 与 variable-step AB history','显式有限图；不是按最终时刻停止的拒步控制器']])}
<p class="small">CFLTimeStep 的零波速分支返回 cap，不使用 Burgers runtime 的 10⁻¹⁴ 速度下限。CFLRollout 的步数在构图时固定，elapsed 会随输入变化。这些差异影响语义，不能仅凭“都叫自适应”就互换。</p>
<h3>导出必须携带时间策略</h3>${flow([['先剪枝数值图','选择兼容的 family 与内部组件'],['再选控制策略','最高权重兼容 controller，冻结 learned CFL'],['保存完整产物','structure.json + weights.pt + controller.json'],['重新测量','轨迹误差、accepted / rejected / fallbacks 与成本']])}<p class="small">单独导出数值 kernel，无法复现不同 CFL、输出截断和拒步带来的完整轨迹。当前最高权重兼容选择也不是遍历全部“硬数值结构 × controller”组合。</p>
<p><a href="${SOURCE}solver_sculpt/hierarchy/burgers_budget_search.py" target="_blank" rel="noopener">查看训练参数与硬导出实现 ↗</a> · <a href="${SOURCE}docs/hierarchy/GLOBAL-CFL.md" target="_blank" rel="noopener">跨方程 CFLTimeStep ↗</a> · <a href="${SOURCE}docs/hierarchy/CFL-ROLLOUT.md" target="_blank" rel="noopener">有限 CFLRollout ↗</a></p>`;
const simpleKernelWalkthrough = pages['simple-solver'];
pages['simple-solver'] = () => simpleKernelWalkthrough() + `
<h3>扩展这个算例：让 controller 决定步长</h3><p>前面的固定步长算例是数值内核。现在用同一个 PC + Godunov + Euler 内核，加上 <code>cell_cfl</code>，让它推进到物理时刻 <strong>T=0.03</strong>。仍是 6 个周期单元，Δx=1/6，CFL=0.2。</p><div class="diagram">${flow([['观察当前状态','a = maxᵢ |ūᵢ|'],['选择时间步','min(0.2·Δx/a, T−t)'],['调用已拆开的内核','PC + Godunov + Euler'],['检查后提交','接受才更新状态与 t']])}<p class="caption">算例图 C · controller 包围数值一步图；内核内部的五层结构保持不变。</p></div>
${table(['尝试','当前最大速度','建议 Δt','输出前剩余时间','实际 Δt / Δx'],[['第一步','2','0.2×(1/6)/2 = 0.0166667','0.03','0.1'],['第二步','1.85','0.2×(1/6)/1.85 ≈ 0.0180180','0.0133333','0.08（被输出时刻截断）']])}
<div class="equation">ū¹ = [0, 0.95, 1.85, 1.15, 0, −0.95]<br>ū(T) = [0, 0.9139, 1.7492, 1.2340, 0.0168, −0.9139]</div><p>第一步恰好等于前面 r=0.1 的手算。第二步因波速减小，本来可以走更大一步，但剩余时间更短，最终取 r=0.08。两步均接受，没有拒步或回退；这不是所有初态的保证。</p>
${code('Python · 同一内核接入实际 CFL rollout',`import torch
from solver_sculpt.hierarchy.burgers_catalogue_supernet import (
    build_burgers_catalogue_supernet,
)
from solver_sculpt.hierarchy.burgers_control import PRESETS, rollout

u0 = torch.tensor([[0., 1., 2., 1., 0., -1.]], dtype=torch.float64)
net = build_burgers_catalogue_supernet().select_solver(
    "fv_godunov_pc_rk1"
).eval()
with torch.no_grad():
    result = rollout(net, u0, [0.03], 1/6, PRESETS["cell_cfl"])
expected = torch.tensor([[[0., .9139, 1.7492, 1.234, .0168, -.9139]]],
                        dtype=torch.float64)
torch.testing.assert_close(result.predictions, expected)
assert result.counters[0]["accepted"] == 2
assert result.counters[0]["rejected"] == 0
print(result.traces[0])  # 查看两个实际 dt 与接受记录`)}
<div class="note">这个例子演示运行时调整 Δt，没有进行训练。接入 BudgetSearchModel 后，CFL raw 和 controller gate 才会作为参数由优化器更新。详细的五层控制映射、可学习范围与梯度限制见 <a href="#controllers">CFL、拒步与回退</a>。</div>`;


pages['e2e-training']=()=>head('08','TRAINING DESIGN · 2026-09-24','在同一段物理时间内，一起学习算法与步长。','从初态出发，用同一个 supernet 自回归推进到 T。重构、通量、推进器和 CFL 控制器共同决定轨迹；用轨迹误差与单位物理时间成本联合训练。')+`
<div class="note"><strong>本次确定的设计，尚待实现与实验验证。</strong>本页采用 batch <strong>标准差</strong>归一化、λ=1；不使用误差估计、拒步或重试。其他章节描述已有实现，包括不同的控制与预算策略，不能直接视为本方案的实现。</div>
<h3>先看最终的训练目标</h3>
<div class="equation">L<sub>batch</sub> = mean(E) / stopgrad(max(std(E), ε<sub>E</sub>))<br>　　　　 + mean(C) / stopgrad(max(std(C), ε<sub>C</sub>))</div>
<p>E 是每条完整轨迹上的误差加权求和，C 是平均一步计算量除以平均建议步长。先为 batch 中每条轨迹计算一个 E 和一个 C，再分别计算标准差；两个归一化项直接相加。</p>
<h3>1 · 四个模块如何组成一步</h3>
<div class="diagram"><div class="diagram-head"><p class="label">ONE STEP · FOUR MODULES</p><span class="chip">循环至 t = T</span></div>
<div class="e2e-modules"><div class="node teal"><b>重构 R</b><span>单元均值 u → 界面左右状态</span></div><div class="node blue"><b>通量 F</b><span>左右状态 → 共享界面通量 → 空间残差 A(u)</span></div><div class="node purple"><b>推进器 P</b><span>用 A 与 Δt 计算各阶段，混合候选更新 → uⁿ⁺¹</span></div><div class="node amber"><b>控制器 H</b><span>状态 / 波速 → CFL → 建议 h → 实际 Δt，送入推进器</span></div></div>
<p class="caption">依赖：R → F → P；H → P。P 在中间阶段重复调用同一套 R、F。输出状态反馈到下一步。通量后的散度是固定的守恒组装，不增加一个搜索模块。</p></div>
<div class="equation">A<sub>Θ</sub>(u)<sub>i</sub> = −(F̂<sub>i+½</sub> − F̂<sub>i−½</sub>) / Δx<br>Θ = {重构参数与 gate，通量参数与 gate，推进器 gate α，控制器参数 φ}</div>
<p>重构与通量在各自兼容接口上做归一化加权混合。所有阶段共享这些参数；边界条件与守恒散度保持一致。不同物理方程应使用相应的特征波速，不把 Burgers 的公式直接用于所有 PDE。</p>
<h3>2 · 控制器选步，完整轨迹决定步数</h3>
<div class="equation">ν<sub>φ</sub>(zₙ) = ν<sub>min</sub> + (ν<sub>max</sub> − ν<sub>min</sub>) sigmoid(g<sub>φ</sub>(zₙ))<br>hₙ = ν<sub>φ</sub>(zₙ) Δx / a<sub>Θ</sub>(uₙ)<br>Δtₙ = min(hₙ, T − tₙ)<br>tₙ₊₁ = tₙ + Δtₙ</div>
<p>先从一个全局可学习 CFL 开始；以后可把 g 扩展为状态相关函数。Burgers 的一种波速选择是 a=max(a<sub>floor</sub>, max|u<sub>L</sub>|, max|u<sub>R</sub>|)，波速下限避免除零。CFL 上下界要与候选数值方法兼容；限幅 CFL 本身不是任意混合算法稳定性的证明。</p>
<p><strong>h 是截断前的建议步长；Δt 是真正推进的时间。</strong>最后一步用 Δt 恰好到达 T。每条轨迹的 N 可以不同，不限制为 rollout4，也不在每一步喂回参考状态。失稳、非有限值或超出工作量上限的轨迹需要记录为失败，不能删除后只平均成功样本；具体失败处理策略需在实验协议中固定。</p>
<h3>3 · 混合推进器，而不是只混合空间模块</h3>
<div class="equation">π = softmax(α)<br>uₙ₊₁ = Σ<sub>k</sub> π<sub>k</sub> P<sub>k</sub>(uₙ, Δtₙ; A<sub>Θ</sub>)<br>P<sub>k</sub> ∈ {Euler, SSPRK2, SSPRK3}</div>
<p>各候选从同一个 uₙ 出发，使用同一个实际 Δtₙ，先算各自完整一步，再加权得到下一状态。参考解只用于计算损失。带有 Euler 权重的混合一般不能保留三阶精度，阶数与稳定性需要独立验证。</p>
<details><summary>展开三个候选，查看共享的计算</summary>
<div class="equation">k₁ = A(u)；v = u + Δt k₁；P₁ = v<br>k₂ = A(v)；P₂ = ½u + ½(v + Δt k₂)<br>w = ¾u + ¼(v + Δt k₂)<br>k₃ = A(w)；P₃ = ⅓u + ⅔(w + Δt k₃)</div>
<p>共享后，完整软混合需要 3 次空间残差求值，而不是 1+2+3=6 次。只要三个候选仍被执行，某个 gate 变小就不会自动减少实际运算。结构成本必须按执行图及共享节点计算。</p></details>
<h3>4 · 精度：在真实推进时刻上做加权求和</h3>
<p>对第 b 条轨迹，参考解在实际到达的 t<sub>b,n</sub> 上查询。以均匀网格标量问题的单元均值 MSE 为例：</p>
<div class="equation">e<sub>b,n</sub> = (1 / N<sub>x</sub>) Σ<sub>i=1…Nₓ</sub> [u<sub>b,n,i</sub> − u*<sub>b,i</sub>(t<sub>b,n</sub>)]²<br>E<sub>b</sub> = Σ<sub>n=0…Nᵦ−1</sub> Δt<sub>b,n</sub> · (e<sub>b,n</sub> + e<sub>b,n+1</sub>) / 2</div>
<p>这就是梯形求和：每段时间乘以两端误差的平均值，再把所有段相加。不是按步数简单平均，也不要求固定监督时刻。若初态一致，e<sub>b,0</sub>=0。这里保留误差的时间累积量，不再除以 T；所有样本采用相同物理时长。</p>
<p>例如 Δt=[0.1, 0.2]，三个时刻的误差为 [0, 0.02, 0.05]，则 E=0.1×0.01+0.2×0.035=0.008。该数值仅用于解释公式。</p>
<div class="note">时间戳也依赖训练参数：u*(t) 应使用可微解析解或经过验证的可微时间插值，保留查询时间的梯度。大步长可能漏掉区间中的误差峰值，因此评估时还应使用更密的独立参考采样检查求和误差。</div>
<h3>5 · 成本：平均一步计算量 / 平均建议步长</h3>
<div class="equation">c̄<sub>b</sub> = (1 / N<sub>b</sub>) Σₙ c<sub>b,n</sub><br>h̄<sub>b</sub> = (1 / N<sub>b</sub>) Σₙ h<sub>b,n</sub><br>C<sub>b</sub> = c̄<sub>b</sub> / h̄<sub>b</sub> = (Σₙ c<sub>b,n</sub>) / (Σₙ h<sub>b,n</sub>)</div>
<p>c 是依据网络执行结构直接计算的工作量，例如算子计数或固定权重的运算量，包含全部执行候选、RK 阶段和控制器，并扣除共享子表达式的重复计数。无需另训成本预测网络，但它表示计算工作量，不等于设备上的实际耗时。</p>
<p><strong>训练分母使用建议 h，而不是末步截断后的 Δt。</strong>若改用实际 Δt，则 ΣΔt=T，目标变为 Σc/T；固定执行步数的区域内，常量每步成本对步长没有梯度，只有跨越步数边界时才跳变。建议步长保留了局部效率信号，例如常量 c、h 时 C=c/h，∂C/∂h=−c/h²。</p>
${table(['量','用途','需要注意'],[['Σc / Σh','训练的成本率近似','末步未截断 h 会引入偏差；不是 mean(c/h)'],['Σc / T','评估真实执行工作量率','按真实执行步数计数'],['实际 wall time / T','测量设备运行效率','包含内存、并行与调度影响，另行实测']])}
<p>因此这里仍是一个<strong>解析成本近似</strong>，不是耗时的精确可微表达式。普通自动微分只沿实际执行路径工作，N 的变化是离散的，整个目标只能在部分区域内可微。完整软混合若执行图固定，c 对 gate 没有直接梯度；gate 仍可通过状态、波速和 h 影响成本。若要奖励硬结构剪枝，需要另行定义并验证导出结构的成本目标。</p>
<h3>6 · Batch 标准差归一化，两个系数都取 1</h3>
<p>一个 batch 包含 B 条轨迹，每条产生一对 (E<sub>b</sub>, C<sub>b</sub>)。分别计算总体标准差，对应 PyTorch 的 <code>unbiased=False</code>：</p>
<div class="equation">μ<sub>E</sub> = (1/B) Σ<sub>b=1…B</sub> E<sub>b</sub><br>σ<sub>E</sub> = √[(1/B) Σ<sub>b=1…B</sub> (E<sub>b</sub> − μ<sub>E</sub>)²]<br>μ<sub>C</sub> = (1/B) Σ<sub>b=1…B</sub> C<sub>b</sub><br>σ<sub>C</sub> = √[(1/B) Σ<sub>b=1…B</sub> (C<sub>b</sub> − μ<sub>C</sub>)²]<br>s<sub>E</sub> = stopgrad(max(σ<sub>E</sub>, ε<sub>E</sub>))<br>s<sub>C</sub> = stopgrad(max(σ<sub>C</sub>, ε<sub>C</sub>))<br><strong>L<sub>batch</sub> = μ<sub>E</sub>/s<sub>E</sub> + μ<sub>C</sub>/s<sub>C</sub></strong></div>
<p>用标准差而不是方差，分子与分母单位一致；改变误差或成本的计量单位时，若保护下限同比缩放，归一化项不变。分子保留原始均值，<strong>不减 batch 均值</strong>，否则平均后的目标会变成零。</p>
<p>分母停止梯度，避免优化器通过改变分母来降低本次损失。ε<sub>E</sub>、ε<sub>C</sub> 是各自单位下的正下限，防止零方差时除零；具体值需要按数据量级确定。B=1 或样本几乎相同时，权重会由下限主导，应记录这一情况。</p>
${code('PyTorch · 目标计算示意（不是现有训练 API）',`# E, C: shape [B]; 每项来自一条推进到 T 的完整轨迹
scale_E = E.detach().std(unbiased=False).clamp_min(eps_E)
scale_C = C.detach().std(unbiased=False).clamp_min(eps_C)
loss = E.mean() / scale_E + C.mean() / scale_C

optimizer.zero_grad()
loss.backward()
optimizer.step()`)}
<div class="note">这是一种按 batch 波动尺度重标度的方法。λ=1 不意味着两项梯度相等，也不自动确定最合适的精度–效率交换比例。应同时记录原始 E、C、标准差、下限触发率及各项梯度贡献。</div>
<h3>7 · 一次参数更新的完整顺序</h3>
<ol><li>采样 B 个初态，准备共同的物理终点 T、网格及可查询的参考解。</li><li>每条轨迹从自身预测状态连续推进：控制器选 h、末步截断、混合推进器更新；记录时间、误差和结构工作量。</li><li>推进到 T 后，用真实 Δt 计算 E，用建议 h 计算 C；在 batch 内计算停止梯度的标准差尺度。</li><li>对完整 batch loss 反向传播，一起更新四个模块的参数与 gate。中间状态不 detach；内存不足时可采用保留梯度语义的 checkpoint 重计算。</li><li>独立评估完整轨迹、失败率、工作量与真实耗时；若导出硬 solver，重新运行评估，不能沿用软混合的指标。</li></ol>
<p class="small">可微范围包括已执行各步的状态、波速、建议步长、实际时间、参考时间查询和数值更新。max/min 的切换、动态循环次数与硬剪枝不具有普通意义下的全局光滑梯度。实现前需把候选兼容范围、成本计数、参考插值、数值保护和失败处理写入固定协议。</p>
`;

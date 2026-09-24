本篇给第二至第四讲增加一张方法地图。先记住各类方法怎样得到界面状态，
再把它们放回仓库的组件层级；不要求一次记住全部公式。

## 1. 共同任务：平均值变成界面状态

在本教程的一维有限体积语境中，重构模块的职责是：

\[
\{\bar u_j\}_{j\in\text{邻域}}
\xrightarrow{\text{重构}}
\left(u^L_{i+1/2},u^R_{i+1/2}\right).
\]

输入是若干格的平均值，输出是同一个界面两侧的估计。后续的通量模块再接收
这两个状态，产生一个公共数值通量。有的实现显式构造格内多项式，有的只计算
需要的边界值；程序不必真的存下整条曲线。

例如相邻三格平均值为 1、2、3，局部数据来自线性增长：对中间格的**右端**，
PC 给出 2；使用 minmod 的线性重构得到斜率增量 1，给出 \(2+1/2=2.5\)。
它们在完成同一个估计任务，但使用的信息不同。这里只计算了界面的左状态；
右状态还要由右邻格重构。

## 2. 七类常见选择

| 类型 | 怎样估计界面状态 | 怎样应对间断或陡变 | 读代码时先找什么 |
|---|---|---|---|
| **PC / PCM：分片常数** | 整格取单元平均，直接作为端点值 | 不引入额外格内变化；配合合适的通量与时间步，是最简单的基线 | 读取本格与邻格，没有斜率 |
| **PLM / MUSCL：分片线性** | 邻居差分估计斜率，再取平均值加减半个斜率增量 | limiter 减小不合适的斜率，必要时退回常数 | 差分、斜率限制、端点计算 |
| **PPM：分片抛物线** | 用端点值和单元平均确定格内二次曲线 | 对端点和曲线形状施加单调性约束；具体版本还可有其他修正 | 界面插值、曲率、形状限制 |
| **ENO：本质无振荡重构** | 自适应选择一个较光滑的模板，在该模板上重构 | 尽量避开跨越间断的数据 | 差分比较、模板选择、候选求值 |
| **WENO：加权 ENO** | 组合多个小模板得到的候选界面值 | 用平滑度调整非线性权重，降低不光滑候选的贡献 | 候选、平滑度、评分、归一化加权 |
| **TENO：目标 ENO** | 筛选候选模板，再组合留下的候选 | 用传感器与阈值剔除不光滑候选，保留者采用重新归一化的线性权重 | 平滑度传感器、开关、线性权重归一化 |
| **MP5：五阶保单调重构** | 先算高阶候选界面值，再检查是否需要限制 | 通过利用邻域差分和曲率的约束修正候选，尽量保留光滑区域的高阶信息 | 五阶预测、是否限幅的判定、允许区间 |

这些名称的分类依据并不完全相同：PC、PLM、PPM 强调格内形状；ENO、WENO、
TENO 强调模板选择或组合机制；MP5 强调高阶预测与保单调限制。它们也不是
一条“越往下越好”的排名。

PC 通常是一阶空间重构，PLM 通常为二阶；PPM 使用二次格内曲线。
ENO3、WENO3、WENO5、TENO5、MP5 名字中的数字表示相应构造的空间设计阶数。
这些阶数需要相应的光滑性和参数条件；限制器激活、光滑极值或间断附近的
表现要另行分析。**多项式次数、空间精度、整个 solver 的时空精度是三个概念**：
例如 WENO5 可以组合三个二次多项式的边界估计，达到五阶空间设计精度。

关于有限体积重构及 ENO/WENO 的模板思想，见
[Zhang 与 Shu 的综述，第 2 节](https://academicweb.nd.edu/~yzhang10/WENO_ENO.pdf)；
PPM、TENO、MP5 的方法来源分别见
[Colella 与 Woodward](https://www.sciencedirect.com/science/article/pii/0021999184901438)、
[Fu、Hu 与 Adams](https://portal.fis.tum.de/en/publications/a-family-of-high-order-targeted-eno-schemes-for-compressible-flui/)、
[Suresh 与 Huynh](https://ntrs.nasa.gov/citations/19970010128)。

## 3. 最容易混淆的四种高阶机制

面对“有些邻居平滑，有些邻居跨越间断”的情况，可以用下面四句话区分：

- **ENO：选择一个模板。** 经典 ENO 通过逐步比较差商来扩展模板；不能简单等同于计算 WENO 的三个平滑度后取最小者。
- **WENO：调整多个候选的权重。** 以第四讲的 JS 为例，不光滑候选通常获得很小的正权重，并不直接被删除。
- **TENO：先保留或剔除，再加权。** 被剔除候选的权重为零；所有模板都通过判定时，恢复背景线性组合。
- **MP5：先预测，再按需要限制。** 核心是高阶候选和约束过程，不是 WENO 的另一套非线性权重。

沿用第四讲的候选值 \(q_k\) 与固定权重 \(d_k\)，TENO 的组合步骤可概括为：

\[
\delta_k\in\{0,1\},\qquad
\omega_k=\frac{d_k\delta_k}{\sum_j d_j\delta_j},\qquad
u^L=\sum_k\omega_kq_k.
\]

这里 \(\delta_k\) 是由具体 TENO 传感器和阈值决定的保留开关。
这是机制示意；完整实现还必须明确传感器、参数，以及非零分母的保障。
因此 TENO 的 cutoff、WENO 的评分方式、MP5 的允许区间，都值得作为内部机制
单独理解。TENO 的候选剔除思想见
[原论文的作者机构记录](https://portal.fis.tum.de/en/publications/a-family-of-high-order-targeted-eno-schemes-for-compressible-flui/)。

## 4. 家族、限制器、权重和变量是不同的选择轴

| 选择轴 | 例子 | 它改变什么 |
|---|---|---|
| 重构家族 | PC、MUSCL、PPM、ENO、WENO、TENO、MP5 | 得到界面状态的总体过程 |
| 斜率限制器 | minmod、MC、superbee、van Leer、van Albada | 对 MUSCL 等构造中的局部变化量怎样限幅 |
| WENO 权重构造 | JS、Z | 怎样从平滑度等信息得到候选权重 |
| 重构变量 | 守恒变量、原始变量、特征变量 | 在哪些量上执行重构 |
| 重构参数 | 模板宽度、\(\epsilon\)、TENO cutoff、limiter 参数 | 给定机制的具体数值行为 |

例如 `muscl_minmod` 与 `muscl_mc` 可以共享差分与端点计算，只替换斜率限制。
`weno5_js` 与 `weno5_z` 可以共享候选与平滑度，改变权重评分。
不同家族不一定拥有同样的内部选项，不能把所有选项任意交叉组合。

对 Euler 这类方程组，“重构变量”需要额外留意。守恒变量可以是密度、动量、
总能量；原始变量可以是密度、速度、压力。特征重构则先把邻域状态投影到一个
局部波基底，分别重构，再变回状态。因此“特征 WENO”仍属于 WENO 家族，只是
使用了不同的变量表示。变量之间的非线性转换还涉及平均值与点值的区别，不能
默认它们可以任意互换。

另一个命名细节：MUSCL 和 PPM 在文献中也可指包含时间预测等步骤的完整方法。
本表比较的是它们的**空间重构职责**。例如 MUSCL–Hancock 中的半步预测，
应与这里单独讲解的格内线性重构区分；完整 PPM 也可能包括特征追踪、激波
展平和接触间断陡化，而一个名为 `ppm` 的空间模块未必包含全部步骤。

## 5. 对应仓库：按具体入口确认支持范围

当前目录的早期 [`burgers.py`](../../solver_sculpt/burgers.py) 使用三类重构：

| `expert_flux` 名称 | 实际重构 |
|---|---|
| `rusanov`、`godunov` | PC |
| `muscl_minmod`、`muscl_mc` | MUSCL，加不同斜率限制器 |
| `weno5` | WENO5-JS |

这里 expert 的名字混合了重构与通量配置，不能将每个名字都当作独立的重构
家族。较新的 `codex/hyperbolic-components-v1` 分支，核查提交为
`90bf0dcc76899f6a6f8abc29dc474103681fcddb`，有多套组件入口：

| 入口与固定版本源码 | 本篇相关选择 |
|---|---|
| [`programs/api.py` 的 `Recipe`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/programs/api.py) | `constant`；`muscl_minmod`、`muscl_mc`、`muscl_superbee`、`muscl_van_leer`、`muscl_van_albada_positive`；`eno3`；`weno3_js`、`weno5_js`、`weno5_z` |
| [`solvers.py` 的 `SolverSpec`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/solvers.py) | 包含 PC、多个 MUSCL、WENO5、ENO3，另有 `ppm`、`teno5`、固定线性组合 `linear5` |
| [`burgers_classical_fv.py`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/burgers_classical_fv.py) | 包含 PC、四种线性限制器、WENO3/5、`mp5`、`teno5`；这里 WENO 标签如 `weno5js` 不带下划线 |

这些文件属于上述分支，不在当前目录的早期源码中。某个方法在一套入口中
存在，不代表所有入口都接受同一个字符串；也不代表每个方程、离散框架都可用。
例如该版本 `Recipe.variables` 接受 `conservative` 和 `characteristic`，
不能因为通用概念表出现原始变量，就向这个接口传入 `primitive`。

进一步读实现时：

- [`programs/lowering.py` 的 `_reconstruction_l1`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/programs/lowering.py)展示 MUSCL 的斜率机制，以及 WENO 的候选、平滑度、评分与归一化；特征重构在外围完成投影和逆变换。
- [`mechanisms.py` 的 `eno3` 与 `ppm`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/mechanisms.py)分别展示递归差分选择和受限抛物线重构。这里的 `m.ppm` 明确不包含原始完整 PPM 的可选陡化、展平及特征时间追踪。
- [`hyperbench_reconstruction.py` 的 `mp5` 与 `teno5`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/hyperbench_reconstruction.py)展示高阶预测与限制、候选筛选与组合；该文件固定的 TENO 参数应随算法一并保留。

## 6. 与 L1/L2 拆分怎样对应？

在教学上的职责划分中，L1 可以选择完整重构方法，L2 则打开它的内部机制：

| L1 重构选择 | 可进一步理解的内部机制 |
|---|---|
| MUSCL | 邻域差分 → 限制斜率 → 计算端点 |
| PPM | 估计界面值 → 约束格内曲线 → 取边界状态 |
| ENO | 比较差分 → 选择模板 → 求值 |
| WENO | 候选与平滑度 → 权重评分 → 归一化组合 |
| TENO | 候选与传感器 → 保留开关 → 归一化组合 |
| MP5 | 高阶预测与约束计算 → 判定是否限制 → 输出状态 |

表中的箭头表示数据依赖，不要求每一项都注册为独立的 L2 节点。某个版本也
可能把完整 ENO 或 MP5 包成一个 L2 机制，再向更低层展开；实际粒度以该版本
的注册和展开规则为准。

替换 L1 重构时，要保留接口含义：左右状态属于同一界面，变量表示一致，
所需邻域和边界数据可用。高阶方法常需要更宽模板，不能只改方法名而忽略边界。
另外，有限差分 WENO 常重构分裂通量；其输入输出与这里的有限体积状态重构
不同，不能仅凭都叫 WENO 就直接接到同一个接口。

## 7. 自测：换掉了哪个部分？

下面三项修改分别涉及什么职责？

1. `muscl_minmod` 改为 `muscl_mc`。
2. `weno5_js` 改为 `weno5_z`。
3. 保留 WENO5 重构，将后面的 Godunov 改为 Rusanov。

<details>
<summary>展开答案</summary>

1. 保持 MUSCL 家族，替换斜率限制机制。
2. 保持 WENO5 家族，替换权重构造。
3. 重构保持不变，替换界面通量模块。

若将 WENO5 整体换成 MP5，则是换重构家族；不能把 MP5 当成一个新的 WENO
权重公式。理解这些区别，才能判断一个搜索位置究竟允许替换整个模块，还是
只允许替换模块内部的一项机制。

</details>

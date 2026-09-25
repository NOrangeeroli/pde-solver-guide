本篇介绍最近实现的 MUSCL–Hancock、PPM、Central-upwind 和 THINC/BVD。
它们都以单元平均数组为持久状态，但名称所指的职责并不相同。
阅读目标是能回答：**它改变了哪一段计算，输入输出是什么，哪些模块还能共享？**

## 1. 先把四个名字放回组件图

对于 Burgers 方程，物理通量始终为 \(f(u)=u^2/2\)。算法之间改变的是怎样
近似一个时间步内的界面输运，不是更换这个物理通量。

| 本次 solver | 重构 | 界面通量 | 时间处理 | 控制器 |
|---|---|---|---|---|
| MUSCL–Hancock | MC 限制的分片线性 | Godunov | 格内预测半步，再做整步守恒更新 | CFL 选步 |
| PPM | 单调抛物线 | Godunov | 特征方向的区域平均预测，再更新 | CFL 选步 |
| Central-upwind | MC 分片线性 | KNP 双向速度通量 | SSP-RK3 | CFL 选步 |
| THINC/BVD | MUSCL 与 THINC 候选，由 BVD 选择 | Godunov | SSP-RK3 | CFL 选步 |

这些是**本仓库的具体组合**。例如 Central-upwind 可以搭配其他重构，BVD
也可以比较其他候选，并不被名字固定为表中的全部组件。

前两条路线的一步计算是：

```text
控制器给出 dt
    ↓
单元平均 → 空间重构 → 时间预测后的界面状态 → 公共通量 → 下一时刻单元平均
```

后两条采用第六讲的半离散结构：

```text
控制器给出 dt
    ↓
RK 的每个阶段：阶段状态 → 重构 → 公共通量 → 通量差变化率
    ↓
组合阶段结果，得到下一时刻单元平均
```

区别在于：前两条的界面状态已经依赖 `dt`。不能把它们当作与步长无关的
\(\mathcal L(U)\)，再机械套一层 RK3，否则得到的是另一个算法。

## 2. MUSCL–Hancock：把空间斜率预测到半个时间步之后

**改进的模块：时间预测（与重构耦合）。** 在 MC 线性重构与 Riemann 通量之间增加半步预测；不是更换 Godunov 通量或 CFL 控制器。输入是单元平均、受限斜率和 dt/dx，输出是预测到半步的左右界面状态。

MUSCL 解决“格子内部是否有斜率”；Hancock 再解决“这些状态在这半步内
会如何变化”。只用起点的左右端值计算整步输运，会遗漏时间变化。

设 \(s_i\) 是一格宽度上的有限变化量，先用 MC 限制器得到：

\[
 u_{i,L}=\bar u_i-\frac{s_i}{2},\qquad
 u_{i,R}=\bar u_i+\frac{s_i}{2}.
\]

注意这里 L、R 是**同一格的左右端**，不是同一个界面的两侧。预测半步：

\[
 u_{i,L}^{*}=u_{i,L}-\frac{\Delta t}{2\Delta x}
 [f(u_{i,R})-f(u_{i,L})],\qquad
 u_{i,R}^{*}=u_{i,R}-\frac{\Delta t}{2\Delta x}
 [f(u_{i,R})-f(u_{i,L})].
\]

到界面 \(i+1/2\) 时，把 \(u_{i,R}^{*}\) 与 \(u_{i+1,L}^{*}\) 交给
Godunov，得到共享通量，再按通量差更新单元平均。

**手算。** 取 \(\bar u_i=1,s_i=0.4,\Delta t/\Delta x=0.2\)。起点端值是
0.8、1.2；Burgers 通量差是 \(0.72-0.32=0.4\)。两端都减去
\(0.2\times0.4/2=0.04\)，预测端值变成 0.76、1.16。
这一步还没有更新整格平均值，只准备了算通量所需的局部状态。

代码利用 Burgers 的恒等式
\(f(\bar u+s/2)-f(\bar u-s/2)=\bar u s\)，直接计算预测状态。
它适合展示怎样在较少阶段内组合空间与时间二阶近似；间断附近仍需要限制器，
不能因带有半步预测就取消限制。

## 3. PPM：格内用抛物线，预测时考虑传播能触及的区域

**改进的模块：重构 + 配套时间预测。** 用单调抛物线代替格内线性形状，并对特征方向的区域平均形成预测端值。输入是邻域单元平均及 dt/dx，输出仍是界面左右预测状态；后续 Godunov 通量和守恒组装继续共享。

PPM 是 Piecewise Parabolic Method。比起线性重构，它允许同一格内部有
曲率。先构造端值，再限制不合理的新极值，并保持格内平均不变。
完整 PPM 还涉及时间预测；“把 MUSCL 换成抛物线”没有描述完它的一步算法。
原方法见 [Colella 与 Woodward 的 PPM 论文](https://crd.lbl.gov/assets/pubs_presos/AMCS/ANAG/A141984.pdf)。

用格内坐标 \(0\le\xi\le1\)，可写成：

\[
 p_i(\xi)=u_{i,L}+\xi\bigl[\delta_i+q_{6,i}(1-\xi)\bigr],\quad
 \delta_i=u_{i,R}-u_{i,L},\quad
 q_{6,i}=6\left[\bar u_i-\frac{u_{i,L}+u_{i,R}}2\right].
\]

这个 \(q_{6,i}\) 保证多项式平均等于 \(\bar u_i\)，不会因为画了曲线而
凭空改变这一格的守恒量。

**手算平均值。** 若端值是 0.8、1.2，单元平均为 1.1，则 \(q_6=0.6\)。
多项式的平均是 \(0.8+0.4/2+0.6/6=1.1\)。因此端点平均与单元平均
不必相同，曲率补上了差额。

时间预测的直觉是：若波向右传播，这一步能到达右边界的信息只来自格子
右侧一定宽度的区域。对这个区域的多项式求平均，比只取端点更能反映输运。

本实现令局部速度 \(a_i=\bar u_i\)，右行区域宽度比例
\(\sigma=\max(a_i,0)\Delta t/\Delta x\)，预测右端状态为：

\[
 u_{i,R}^{*}=u_{i,R}-\frac\sigma2
 \left[\delta_i-\left(1-\frac{2\sigma}{3}\right)q_{6,i}\right].
\]

左行时对左端做对应计算。然后仍是 Godunov 通量和守恒更新。
这里冻结了格均值速度，是我们的 Burgers 时间预测近似，**不是精确的非线性
特征追踪**。也没有完整复制气体动力学 PPM 的全部接触间断增强等机制。
抛物线重构更丰富，不代表完整算法自动具有三阶时间精度。

## 4. Central-upwind：用两个方向的速度构造通量

**改进的模块：数值通量。** 用左右传播速度界构造 KNP 双向通量。输入是重构得到的界面左右状态，输出是一个共享通量；本次 MC 重构、SSP-RK3 推进与 CFL 控制器保持各自职责。

这一名称主要改变的是通量计算。重构仍提供界面左右状态；通量模块用左右
传播速度界，而不必解析完整 Riemann 解。本组合采用 KNP 形式且不加额外
反扩散项，参见 [Kurganov–Noelle–Petrova 原论文](https://www.math.umd.edu/~tadmor/centpack/publications/files/Kur-Noe-Ptr_semidiscrete_CU_SISC2001-centpack.pdf)。

对当前标量 Burgers 实现，设：

\[
 a^+=\max(u^L,u^R,0),\qquad a^-=\min(u^L,u^R,0).
\]

当 \(a^+>a^-\) 时：

\[
 \widehat F=
 \frac{a^+f(u^L)-a^-f(u^R)+a^+a^-(u^R-u^L)}{a^+-a^-}.
\]

分母为零时，这里的两个状态都为零，代码返回零通量。
对一般方程组，速度界要根据特征速度确定，不能照抄状态值的最大最小。

**手算。** \(u^L=1,u^R=0\) 时，\(a^+=1,a^-=0\)，所以
\(\widehat F=f(1)=0.5\)：信息全向右，左状态决定输运。
若 \(u^L=-1,u^R=1\)，则两个速度界是 ±1，公式给出 \(-0.5\)，
而精确 Burgers Godunov 通量为 0。后一个例子说明它是近似通量，并不是
换了写法的精确 Godunov。

本 solver 对每个 RK 阶段重新做 MC 重构和该通量计算。它最容易接入之前
的 FV 模块接口：重构输出不变，通量输出形状也不变。

## 5. THINC/BVD：候选是一条斜线还是一条陡峭曲线？

**改进的模块：重构内部的候选与选择机制。** 新增 THINC 候选，用局部 BVD 准则在 MUSCL 与 THINC 之间选择。输入是邻域单元平均，输出是选定的单元左右端值；Godunov 通量和 SSP-RK3 继续使用。它不是更换通量，也不是误差估计控制器。

THINC 提供用双曲正切描述单调跃迁的格内形状；BVD 则决定采用哪一种
候选。两者职责不同：**THINC 是候选重构，BVD 是选择准则**。
BVD 的界面跳跃思想见 [Sun、Inaba、Xiao 的原论文](https://arxiv.org/abs/1602.00814)。

一个示意性的 THINC 格内函数是：

\[
 p_i(\xi)=u_{\min}+\frac{\Delta u}{2}
 \left[1+\theta\tanh\bigl(\beta(\xi-\xi_0)\bigr)\right].
\]

\(\theta\) 指定增减方向，\(\beta\) 控制陡峭程度，位置 \(\xi_0\)
由单元平均匹配确定。我们的版本固定 \(\beta=1.6\)，并为不适宜 THINC
的单元保留 MUSCL。实际代码直接算端值，不需要采样整条曲线。

令候选 \(k\) 给第 i 格左右端值 \(u_{i,L}^{(k)},u_{i,R}^{(k)}\)。
我们的局部 BVD 比较：

\[
 \mathrm{TBV}_i^{(k)}=
 |u_{i-1,R}^{M}-u_{i,L}^{(k)}|
 +|u_{i,R}^{(k)}-u_{i+1,L}^{M}|,
\]

其中两边邻居固定采用 MUSCL 候选 M。只有 THINC 严格减小该值且通过
适用条件检查时才选它；之后组装所有单元的选择，再计算公共 Godunov 通量。

**手算选择。** 固定邻居端值为 0.2、0.9。若 MUSCL 端值是 0.4、0.6，
其 TBV 为 0.5；另一个合法候选的端值若为 0.25、0.85，TBV 为 0.1。
后者在这项准则下更合适。这只演示选择算术，不表示这些端值必由某组
真实 THINC 参数生成。

减少边界跳跃可能减弱数值耗散，但 TBV 小不等于真实解误差一定小。
这种固定邻居的局部选择，也不等于全局最小化全部界面跳跃，更不代表所有
论文中的 BVD 版本。时间上，本实现每个 SSP-RK3 阶段都会重新选择候选。

## 6. 对照代码和五层拆分

代码固定到已验证提交，避免当前教学工作树缺少新文件时产生误导：

- [fv_predictor.py](https://github.com/NOrangeeroli/meta-pde-solver/blob/836e51756705db41d0bbf7bbadfde5f9bc8fea22/hyperbench/solvers/fv_predictor.py)：`interface_states` 与 `step`，包含 Hancock 和 PPM。
- [fv_alternatives.py](https://github.com/NOrangeeroli/meta-pde-solver/blob/836e51756705db41d0bbf7bbadfde5f9bc8fea22/hyperbench/solvers/fv_alternatives.py)：`_reconstruct`、`central_upwind_flux`、`_rhs` 和 `step`。
- [fv_expansion.py](https://github.com/NOrangeeroli/meta-pde-solver/blob/836e51756705db41d0bbf7bbadfde5f9bc8fea22/hyperbench/solvers/fv_expansion.py)：benchmark 入口、CFL 选步和输出时刻处理。

| 层级 | 可以怎样打开这些算法 |
|---|---|
| L0 | 给定 U、dt、dx，执行完整一步 |
| L1 | 重构/预测、通量、守恒组装、阶段组合 |
| L2 | PPM 单调性修正、THINC 候选、BVD 选择、双向速度界 |
| L3 | 邻居读取、端值组合、区域平均公式、跳跃比较 |
| L4 | 索引、加乘除、比较选择、归约，以及 THINC 所需的 exp/tanh 等 |

此表是**教学拆分建议**，不声称所有节点已经注册进现有 DSL。特别是 THINC
涉及超越函数，不能因 NumPy 能执行，就认定已有低层原语或理论成本模型
已经支持。PPM/Hancock 的预测接口还必须显式接收 dt。

## 7. 自测

1. Hancock 为什么不能简单理解为“MC 重构 + Euler”？
2. PPM 的抛物线为什么需要与单元平均匹配？
3. Central-upwind 在本次实现中替换了哪个主要模块？
4. THINC 和 BVD 分别属于候选还是选择器？
5. 哪两种本次实现要在每个 RK 阶段重新计算重构？

答案：1）它先做半步时间预测。2）否则重构会改变格内守恒量。
3）界面通量。4）THINC 是候选，BVD 是选择准则。
5）Central-upwind 和 THINC/BVD。

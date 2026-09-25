前面主要从“每个界面通过多少通量”理解更新。本篇换一个观察角度：
**界面两边的状态差，会分成哪些向左、向右传播的波？它们怎样改变相邻格子？**

波传播法仍可以是有限体积方法，同样保存单元平均。这里比较的是
“重构—通量差—RK”与“波分解—波限制—直接更新”两种组织方式，
不是把波传播法排除在有限体积之外。

## 1. 不只用于 Burgers

Clawpack 的波传播框架可处理多种双曲系统，如声学、浅水、Euler 方程。
Burgers 只有一个状态变量，适合先手算；系统则通常有多个波族、各自的
速度和方向。官方 [波传播算法说明](https://www.clawpack.org/sphinx-versioning/wp_algorithms.html)
给出了以波和 fluctuations 组织更新的一般形式。

先看线性系统 \(U_t+A U_x=0\)。界面跳跃可以分解为：

\[
 U_R-U_L=\sum_p\mathcal W^p,\qquad
 \mathcal W^p=\alpha^p r^p,
\]

其中 \(r^p\) 是特征方向，\(s^p\) 是该波的速度。非线性方程可以使用
局部 Riemann solver 给出相应的波分解；不能把一个全局常数矩阵直接照搬过去。

定义左右传播的变化贡献：

\[
 \mathcal A^-\Delta U=\sum_p\min(s^p,0)\mathcal W^p,
 \qquad
 \mathcal A^+\Delta U=\sum_p\max(s^p,0)\mathcal W^p.
\]

它们通常称为 **fluctuations**。它们不是两个独立的物理通量；更像是一个
界面问题向两边分配的更新贡献。对守恒形式，需要满足与通量跳跃的一致性。

## 2. Burgers：一个跳跃、一种 Roe 波速

对于 \(f(u)=u^2/2\)，令：

\[
 \mathcal W=u_R-u_L,\qquad s=\frac{u_L+u_R}{2}.
\]

则 \(s\mathcal W=f(u_R)-f(u_L)\)。但这个守恒恒等式还不够：
当 \(u_L<0<u_R\) 时，真实解是跨零稀疏波，不能让一条 Roe 波代替整个
稀疏扇而违反熵条件。这个问题及修正动机可参见
[Clawpack 的 Burgers 近似 Riemann 教材](https://www.clawpack.org/riemann_book/html/Burgers_approximate.html)。

本实现对跨零稀疏波用：

\[
 \mathcal A^-\Delta u=-\tfrac12u_L^2,\qquad
 \mathcal A^+\Delta u=\tfrac12u_R^2.
\]

**手算。** 左右状态为 −1、1 时，Roe 波速为 0。若直接用正负速度乘跳跃，
两个贡献都会是零；熵修正后变成 −0.5、0.5，界面向左右都产生变化。
两项相加仍为零，与 \(f(1)-f(-1)=0\) 一致。

## 3. 一阶更新：一格接收两侧界面传来的贡献

记左界面为 \(i-1/2\)、右界面为 \(i+1/2\)，则：

\[
 \bar U_i^{n+1}=\bar U_i^n-
 \frac{\Delta t}{\Delta x}
 \left[\mathcal A^+\Delta U_{i-1/2}
      +\mathcal A^-\Delta U_{i+1/2}\right].
\]

左边界面向右的贡献和右边界面向左的贡献进入这一格。

**符号手算。** 左界面状态为 (1,0)，于是波为 −1、速度 0.5，向右贡献
为 −0.5。右边这格的更新会减去一个负数，因此状态增加；这正对应左边的
正状态向右推进。若右界面贡献为零且 \(\Delta t/\Delta x=0.2\)，
该格平均增加 0.1。

守恒形式下，可以构造等价的共享数值通量，使上述更新写回通量差形式。
因此“没有先显式输出一个 flux 数组”不等于“不守恒”。

## 4. 波限制器：限制的是界面波，不是格内斜率

一阶方法容易抹宽结构。Classic 的二阶修正利用相邻界面同一波族的关系，
在平滑区域保留修正，在波形突变时减弱它。

对第 p 个波族，用迎风邻居计算：

\[
 r^p=\frac{\mathcal W^p_{\mathrm{upwind}}\cdot\mathcal W^p}
 {\mathcal W^p\cdot\mathcal W^p},\qquad
 \widetilde{\mathcal W}^p=\phi(r^p)\mathcal W^p.
\]

速度正时看左侧界面，速度负时看右侧界面。分母为零必须单独处理；本实现
将该比值置零。标量 Burgers 中内积退化为普通乘法。

两个常见限制函数是：

\[
 \phi_{MC}(r)=\max\left(0,\min\left(\frac{1+r}{2},2,2r\right)\right),
\]

\[
 \phi_{SB}(r)=\max\left(0,\min(1,2r),\min(2,r)\right).
\]

**手算。** 当 \(r=0.5\) 时，MC 为 0.75、Superbee 为 1；当 \(r=1\)
时，两者都是 1；当 \(r<0\) 时，两者都为 0。因此 limiter 并不总是
一个小于 1 的“衰减系数”：某些正比值下它可以超过 1。

| 对比 | MUSCL 斜率限制器 | Classic 波限制器 |
|---|---|---|
| 处理位置 | 单元内部 | 单元之间的界面 |
| 主要输入 | 左右差分或候选斜率 | 当前波与迎风相邻同族波 |
| 输出 | 受限格内斜率，用来重构状态 | 受限波，用来构造二阶修正 |
| MC/Superbee 名称 | 限制形状的选择 | 也可用同名限制函数，但输入语义不同 |

所以 benchmark 中 **Classic Superbee** 表示 Classic 波传播更新加 Superbee
波限制器，不等同于“Superbee 分片线性重构 + 任意通量 + RK3”。

## 5. Classic 的二阶修正与完整一步

定义修正通量：

\[
 \widetilde F_{i+1/2}=\frac12\sum_p |s^p|
 \left(1-|s^p|\frac{\Delta t}{\Delta x}\right)
 \widetilde{\mathcal W}_{i+1/2}^p.
\]

完整更新为：

\[
 \bar U_i^{n+1}=\bar U_i^n-
 \frac{\Delta t}{\Delta x}
 \left[\mathcal A^+\Delta U_{i-1/2}
 +\mathcal A^-\Delta U_{i+1/2}
 +\widetilde F_{i+1/2}-\widetilde F_{i-1/2}\right].
\]

这是本篇 Classic 一维更新的核心。修正中已有 \(\Delta t/\Delta x\)，
所以它是依赖步长的完整时间步构造；不能直接把括号除以 dx 当作普通、与
步长无关的半离散 RHS，再随意交给 RK。

```text
控制器给出 dt
    ↓
单元平均 → 边界补齐 → 界面波、速度、左右 fluctuations
                         ↓
                    迎风同族波比较 → 波限制 → 二阶修正
                         ↓
            一阶贡献 + 修正通量差 → 下一时刻单元平均
```

在前面的 (1,0) 界面例子里，若受限波仍为 −1 且 dt/dx=0.2，修正通量为
\(0.5\times0.5\times(1-0.1)\times(-1)=-0.225\)。更新仍需要这一格
两侧的修正通量差，不能只拿这个数直接加到所有格子上。

## 6. Classic 与 SharpClaw 不是同一种时间组织

Classic 本篇方案通过受限波构造直接的二阶时间步。SharpClaw 则采用高阶
重构和半离散波传播残差，再配合 Runge–Kutta。有关后一条路线见
[Ketcheson、Parsani、LeVeque 的高阶波传播论文](https://arxiv.org/abs/1111.3499)。

我们 NumPy SharpClaw 端口的 `sharp_delta` 还包含格内 fluctuations，不能
简化为“Classic 的 limiter 换成 WENO”。它说明波传播思想也能与 WENO、RK
共享部分结构，但不保证两种方法具有完全相同的残差内部接口。

## 7. 与我们的组件体系如何对齐？

| 接口/层级 | 可以共享什么 | 必须保留的差异 |
|---|---|---|
| 持久状态 | 单元平均 U、几何、边界、输出时刻 | 都不必引入额外持久状态 |
| 界面数据 | 左右状态、波速等字段 | FV 通量与 wave/fluctuation 不是同一字段 |
| 守恒修正 | 界面量差分、数组组合 | 一阶 wave 贡献还要正确组装 |
| 完整一步 | `step(U, dt, dx, boundary) → U_next` | 对所有分支最稳妥的公共接口 |
| L1 | 重构/预测或波构造、限制、组装、时间更新 | 不强迫 Classic 伪装成独立重构+RK |
| L2 | 熵修正、同族波比较、MC/Superbee、修正系数 | 限制器的输入语义必须标明 |
| L3/L4 | 相邻移位、内积/乘法、比值、比较选择 | 零分母、方向和边界规则不能丢失 |

L0 是表中的完整一步；后面各层是将它逐层打开。此表是教学语义映射，
不是宣称所有列出的中间接口已经以对应名字注册进 DSL。
在 supernet 中先混合满足同一个完整更新契约的分支，再逐步共享低层节点，
比仅凭“都有 MC”就合并两个 limiter 更容易保持数值含义。

控制器仍负责选步及是否验收。波传播核函数返回的最大速度或实际 CFL
可以给控制器检查，但波限制器本身不负责拒步。我们的 Classic 基线保留
启动步和 CFL 拒步逻辑；最近两组硬化训练部署采用学到的 cell-speed CFL，
不启用拒步，因此不能把两者的性能差异全部归因于限制器。

## 8. 代码入口与自测

以下均固定到本次验证版本：

- [numpy_wave.py](https://github.com/NOrangeeroli/meta-pde-solver/blob/836e51756705db41d0bbf7bbadfde5f9bc8fea22/hyperbench/solvers/numpy_wave.py)：`riemann`、`classic_step`、`sharp_traces`、`sharp_delta`。
- [numpy_wave_driver.py](https://github.com/NOrangeeroli/meta-pde-solver/blob/836e51756705db41d0bbf7bbadfde5f9bc8fea22/hyperbench/solvers/numpy_wave_driver.py)：基线的选步、验收和时间阶段。
- [wave_l1_deploy.py](https://github.com/NOrangeeroli/meta-pde-solver/blob/836e51756705db41d0bbf7bbadfde5f9bc8fea22/hyperbench/solvers/wave_l1_deploy.py)：两组硬化后的 NumPy Classic 部署。

1. 波传播法是否只能求 Burgers？
2. 为什么 (−1,1) 的 Burgers 界面需要熵修正？
3. Classic Superbee 与 Superbee MUSCL 的限制对象有何不同？
4. 为什么 Classic 修正不能直接当作普通的半离散残差？
5. limiter 与控制器谁决定是否拒步？

答案：1）不是，也适用于多种双曲系统。2）真实解包含左右传播的稀疏扇，
单条零速 Roe 波漏掉了它。3）前者限制界面波，后者限制格内斜率。
4）其修正已依赖 dt/dx。5）控制器。

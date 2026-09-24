本节回答：在重构与守恒残差之间，还能放哪些数值通量？先比较最常见的
Rusanov/LLF、Roe、HLL、HLLE、HLLC，再详细打开最容易理解的 Rusanov。
讨论范围仍是无源守恒律的通量形式有限体积方法。

## 1. 同一个位置，不同的局部近似

重构提供同一界面的两个状态，通量模块结合方程信息得到公共通量：

\[
(u^L,u^R;\text{方程信息})\longrightarrow\hat F.
\]

对于方程组，输入状态和输出通量是向量。模块还可能需要材料参数、法向、
波速估计或其他配置，不能仅凭张量形状相同就任意互换。

这里的 Godunov 指上一讲的精确 Riemann 通量。更宽泛的“Godunov-type 方法”
也包含使用近似 Riemann solver 的方法，因此下面几类并不是全部与 Godunov
框架相互排斥。近似方法的动机及分类见
[Clawpack 近似 Riemann 求解器](https://www.clawpack.org/riemann_book/html/Approximate_solvers.html)。

## 2. 常见家族

| 名称 | 怎样近似局部问题 | 主要特点 |
|---|---|---|
| Rusanov / local Lax–Friedrichs（LLF） | 中心通量加一个波速控制的耗散修正 | 只需物理通量和速度上界，结构简单；往往较耗散 |
| Roe | 构造局部线性化，把状态差分解到相应的波 | 区分不同波族；跨声速稀疏波需要熵修正等处理 |
| HLL | 用最左、最右两条估计波包住一个平均中间状态 | 不必解析全部内部波；可能抹宽中间接触波 |
| HLLE | 使用 Einfeldt 类速度估计的 HLL 变体 | 关注强稀疏波等情况下的鲁棒性；保正结论依赖模型、速度及更新条件 |
| HLLC | 在 HLL 两外波之间恢复接触波及两侧中间状态 | 常用于 Euler 方程，改善接触间断的分辨 |

Euler 的接触间断可以先理解为：速度、压力连续，但密度可以跳变的界面。
标量 Burgers 没有 Euler 的这条独立接触波，因此本仓库没有把 Euler HLLC
直接作为 Burgers 的候选。

HLL、HLLE、HLLC 的关系不是单一的升级顺序：HLLE 重点改变速度估计，HLLC
重点恢复中间波结构。Roe 与它们采用另一种近似路线。
参见 [Euler 的 Roe/HLLE 比较](https://www.clawpack.org/riemann_book/html/Euler_approximate.html)
及 [HLLC 原论文](https://link.springer.com/article/10.1007/BF01414629)。

## 3. Rusanov：最容易继续拆开的例子

一维 Rusanov 通量为：

\[
\boxed{
\hat F_{\mathrm{Rus}}=
\frac{f(u^L)+f(u^R)}2
-\frac{\alpha}{2}(u^R-u^L).
}
\]

\(\alpha\ge0\) 是该界面相关传播速度的绝对值上界。本节的 \(\alpha\) 是
一个波速尺度，与第四讲 WENO 的未归一化评分 \(\alpha_r\) 含义不同。
公式与 LLF 名称可见 [MFEM 的 Rusanov 接口说明](https://docs.mfem.org/4.8/classmfem_1_1RusanovFlux.html)。

把它分成两部分理解：

- 中心项：平均左右两侧的**物理通量**。对于非线性通量，它一般不等于
  先平均两个状态再代入 \(f\)。
- 耗散修正：根据状态跳跃和波速尺度，加入数值扩散。

耗散项在通量公式中可以为正也可以为负。“耗散”描述它通过相邻通量差
对状态变化的作用，不是说数值通量只能减小。对于固定的正 \(\alpha\)，
在 PC 重构的通量差中，这部分贡献是：

\[
\frac{\alpha}{2\Delta x}
(u_{i+1}-2u_i+u_{i-1}),
\]

即一个离散扩散项。这解释了为什么较大的耗散会抹平突变。实际局部
\(\alpha\) 可以随界面和状态变化。

对 Burgers，可取：

\[
\alpha=\max(|u^L|,|u^R|).
\]

这是 Burgers 的波速绝对值在两状态之间的上界。对其他非线性方程或系统，
波速估计需要按方程确定，不能把这个标量公式直接复制过去。

## 4. 与 Godunov 手算对比

仍取 Burgers 的 \(u^L=2,u^R=1\)：

\[
f_L=2,\quad f_R=0.5,\quad\alpha=2,\quad u^R-u^L=-1.
\]

于是：

\[
\hat F_{\mathrm{Rus}}=\frac{2+0.5}{2}-\frac22(1-2)=2.25.
\]

上一讲的精确 Godunov 通量为 2。相同左右输入下，二者返回了不同的局部数值
近似；这一个算例不是整条轨迹的精度或稳定性比较。

在线性平流 \(f(u)=au\) 中，若取 \(\alpha=|a|\)，Rusanov 则恰好化为
迎风通量：\(a>0\) 时为 \(au^L\)，\(a<0\) 时为 \(au^R\)。所以不同名称
的模块在某些方程或状态下可能输出完全相同的结果。

## 5. 与其他家族的进一步联系

HLL 使用最左速度 \(S_L\) 与最右速度 \(S_R\)。当 \(S_L<0<S_R\) 时：

\[
\hat F_{\mathrm{HLL}}=
\frac{S_R f_L-S_L f_R+S_LS_R(u^R-u^L)}{S_R-S_L}.
\]

若 \(S_L\ge0\)，取 \(f_L\)；若 \(S_R\le0\)，取 \(f_R\)。特别地，令
\(S_L=-\alpha,S_R=\alpha\)，\(\alpha>0\)，中间公式就变成 Rusanov。
它们可以共享状态跳跃、物理通量、波速和组合等构件。

对 Burgers，未做熵修正的 Roe 通量也有“中心项减耗散”的形式，只是耗散
速度取 \(|(u^L+u^R)/2|\)。在 \((-1,1)\) 的跨零稀疏波中，这个速度为零，
会给出通量 \(1/2\)，而精确 Godunov 为 0。这就是需要处理熵修正的具体动机。
详见 [Clawpack Burgers 近似通量](https://www.clawpack.org/riemann_book/html/Burgers_approximate.html)。

另外，经典全离散 Lax–Friedrichs 可写成类似形式，但耗散系数为
\(\Delta x/\Delta t\)；全局 LF 速度、局部 LLF 速度和这个系数不应不加区分地
使用。选择通量时，需要保留确切的波速/耗散定义。

## 6. 对应仓库：五个 expert 不等于五种界面通量

当前目录 [`burgers.py` 的 `expert_flux`](../../solver_sculpt/burgers.py) 中：

| 配置名称 | 重构 | 界面通量 |
|---|---|---|
| `rusanov` | PC | Rusanov |
| `godunov` | PC | Godunov |
| `muscl_minmod` | MUSCL-minmod | Godunov |
| `muscl_mc` | MUSCL-MC | Godunov |
| `weno5` | WENO5-JS | Godunov |

因此这五个 expert 是五种组合配置，实际使用两种界面通量。这是早期接口把
重构与通量组合封装后的名称；其中的 WENO/MUSCL 指重构职责。

较新的 `codex/hyperbolic-components-v1` 分支在核查提交
`90bf0dcc76899f6a6f8abc29dc474103681fcddb` 中，把两种选择分开：

```python
FLUXES = ("rusanov", "hll", "hlle", "hllc", "roe", "godunov")
```

注册位置为
[`programs/api.py`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/programs/api.py)，
通量展开实现为
[`programs/lowering.py`](https://github.com/NOrangeeroli/meta-pde-solver/blob/90bf0dcc76899f6a6f8abc29dc474103681fcddb/solver_sculpt/hierarchy/programs/lowering.py)。
这些文件属于该分支，不在当前目录的早期源码中。

候选按方程能力检查：例如这里 HLLC 要求理想气体 Euler；HLLE 要求相应的
Einfeldt 速度构造。该列表不是所有方程都可无条件使用六种通量的声明。

在当前有限体积语境中，WENO 可以分别与兼容的 Godunov、Rusanov 或 HLL
通量组合。有限差分的通量分裂 WENO 属于另一条构造路线，需要另行说明。

## 7. 与 L1/L2 拆分怎样对应？

L1 可以在整个界面通量模块之间选择。打开模块后，L2 可以区分不同的机制：

| 通量家族 | 可以进一步观察的内部机制 |
|---|---|
| Rusanov | 物理通量平均、速度上界、跳跃耗散 |
| Roe | 线性化状态、波分解、各波耗散、熵修正 |
| HLL / HLLE | 左右波速估计、中间通量构造、区域选择 |
| HLLC | 外侧波速、接触速度、两侧星区状态、区域选择 |

例如改变 Rusanov 的耗散速度计算，是改变内部机制；把整个 Rusanov 换成 HLLC，
则涉及另一套中间结构。具体能开放哪些搜索位置，还取决于代码中实际定义的
组件接口与约束，不能仅凭名字把任意两个中间张量相加。

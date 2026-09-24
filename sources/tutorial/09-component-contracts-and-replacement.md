上一讲将一个固定算法逐层打开。这一讲开始修改算法：**把其中一个组件换掉，
其余组件怎样继续配合？** 拆分提供了替换位置；替换是否合法，取决于输入、
输出和数值假设是否匹配。

本讲继续对照 main 固定提交
[`20b2e3c23`](https://github.com/NOrangeeroli/meta-pde-solver/commit/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad)，
采用 `SolverSpec` 的一维有限体积单步入口。

## 1. 先做一个确实能接上的替换

保留上一讲的 Burgers 方程、PC 重构、Euler 时间推进和周期边界，只将
Godunov 通量换成 Rusanov 通量。

```text
旧算法：U → PC 重构 → Godunov → 通量差增量 → Euler 更新
新算法：U → PC 重构 → Rusanov → 通量差增量 → Euler 更新
```

两种通量都接收同一界面的左右状态，并返回该界面的公共通量，所以后面的
通量差组装可以继续使用。它们对界面通量的计算规则不同，新算法的结果通常
也不同。

这里区分两种操作：

| 操作 | 希望保持什么 |
|---|---|
| 把同一算法从 L1 展开到 L4 | 保持计算含义；检查展开是否正确 |
| 把 Godunov 换成 Rusanov | 保持接口职责；允许数值结果变化，重新检查算法性质 |

所以不能用“新旧输出必须相同”检验一次有意更换算法的操作。

## 2. 接口不仅包含数组形状

组件之间的约定也称为 contract。本教程先把它理解为：**输入是什么，输出
是什么，以及调用它需要满足什么条件。**

| 接口需要讲清楚的内容 | 本讲的具体约定 |
|---|---|
| 数组布局 | 空间是最后一维，Burgers 每格一个标量 |
| 数据的含义 | U 是单元平均；左右状态是界面两侧取值；F 是公共界面通量 |
| 网格位置与索引 | F[i] 属于第 i 格的右界面；左右状态必须属于同一个界面 |
| 方程与变量 | 物理通量为 u²/2；不能把另一个方程的通量直接接进来 |
| 缩放约定 | 此入口的 divergence 已包含 dt/dx，返回本步增量 |
| 适用条件 | 周期边界、需要哪些邻居、步长限制，以及适用的状态范围 |

在本例中，单元平均数组 U 与界面通量数组 F 都有 N 个数，但它们的物理
含义和位置不同。只检查 `shape == (N,)`，无法辨认这两者。
如果换成 Euler 方程组，还需明确通道存的是密度、动量、总能量，还是其他
变量；相同的通道数量也不意味着可以直接互换。

## 3. 手算更换通量后的结果

仍取 \(U=[1,2,4]\)、\(\Delta t/\Delta x=0.1\)。重构没有变，因此三个
界面的左右状态仍为 \((1,2),(2,4),(4,1)\)。

本实现的 Burgers Rusanov 通量为：

\[
\hat F_R(u^L,u^R)
=\frac{f(u^L)+f(u^R)}{2}
-\frac{\alpha}{2}(u^R-u^L),
\quad f(u)=\frac{u^2}{2},\quad
\alpha=\max(|u^L|,|u^R|).
\]

以第一个界面为例：

\[
\hat F_R(1,2)
=\frac{0.5+2}{2}-\frac{2}{2}(2-1)=0.25.
\]

三个界面计算完后：

| 界面左右状态 | Godunov 通量 | Rusanov 通量 |
|---|---:|---:|
| (1,2) | 0.5 | 0.25 |
| (2,4) | 2 | 1 |
| (4,1) | 8 | 10.25 |

沿用同一通量差更新：

\[
\Delta U_R=-0.1[0.25-10.25,\ 1-0.25,\ 10.25-1]
=[1,-0.075,-0.925],
\]

\[
U_R^{n+1}=[2,1.925,3.075].
\]

Godunov 的结果是 \([1.75,1.85,3.4]\)。两者不同，但分量之和都是 7。
本例说明替换改变了更新结果，同时保留了这套周期通量差模板的守恒结构。
仅凭这一个例子，不能判断哪种方法对所有问题更准确。

## 4. 对应代码：优先通过已声明的配置替换

在含 hierarchy 的 main 检出根目录运行：

```python
from dataclasses import replace
import torch
from solver_sculpt.hierarchy import SolverSpec, solve_step

base = SolverSpec(
    equation="burgers", reconstruction="pc", flux="godunov",
    integrator="euler", boundary="periodic",
)
alternative = replace(base, flux="rusanov")
u = torch.tensor([1., 2., 4.], dtype=torch.float64)

for spec, expected in [
    (base, [1.75, 1.85, 3.4]),
    (alternative, [2., 1.925, 3.075]),
]:
    result = solve_step(u, 0.1, spec)
    torch.testing.assert_close(
        result, u.new_tensor(expected), rtol=0, atol=1e-14,
    )
    torch.testing.assert_close(result.sum(), u.sum(), rtol=0, atol=1e-14)
    print(spec.flux, result.tolist())
```

这里的 `replace` 来自 Python 的 `dataclasses`，生成一个只改变 flux 字段的
配置；它不是 hierarchy 中的图替换函数。

在 L1，两种配置都使用 `n.flux`。在 L2，Godunov 路径进入 `m.riemann`；
Rusanov 路径分成 `m.physical`、`m.central_flux`、`m.speed_bound` 和
`m.dissipate`。**相同的模块职责，可以有不同的内部机制组合。**

源码：[SolverSpec 与单步构造](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/solvers.py)、
[通量模块的展开分支](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/modules.py)、
[波速与耗散机制](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/mechanisms.py)。

## 5. 为什么有些替换需要联动修改？

| 想替换的部分 | 同时需要检查什么 |
|---|---|
| PC → WENO5 | 更多邻居与边界填充；重构变量；组合方法适用的 CFL |
| Godunov → Rusanov | 同一方程、同一界面位置；波速估计与适用步长 |
| Euler 时间推进 → SSP-RK3 | 在每个阶段重新计算空间模块；阶段时间与边界；适用的稳定性条件 |
| 有限体积 → DG | 状态可能包含单元内多个系数，初始化、残差、限制器与输出都要配合 |
| CFL 控制 → 时间误差控制 | 对应时间方法的误差估计器、容差、接受／拒绝与步长更新 |

例如，虽然配置允许选择 WENO5，原来给 PC 使用的步长仍需重新评估。
`SolverSpec.validate()` 检查代码明确支持的组合及参数；它不会自动证明
该组合在任意状态和任意步长下稳定。

也不应把前一讲的 Euler step-doubling 平方根反馈直接套给任意高阶 RK：
需要先确定误差估计随 dt 的阶数，以及接受哪一个候选结果。

## 6. 共享组件时，共享的是什么？

SSP-RK3 的三个阶段可以使用同一套重构规则、同一套通量公式，甚至同一组
可学习参数。但是各阶段的状态不同，因此必须重新计算界面状态与通量。
复用组件定义不意味着复用上一个阶段算出的数组。

同样，正向与负向传播可以共享某种重构公式，但模板方向、索引与边界仍需
匹配。不同方程可以复用加减乘、线性组合等构件，物理通量和波速则必须符合
各自方程。

以后若把某个重构或权重组件变成可学习模块，也要先约定它输出的是界面值、
权重还是通量。优化器使损失降低，并不能代替这些接口约定。

## 7. 怎样验证替换后的组合？

每类检查回答不同问题：

| 检查 | 能帮助发现什么 |
|---|---|
| 形状与类型检查 | 通道错位、广播错误、布尔量接到数值端口 |
| 语义接口检查 | 在支持范围内发现单元／界面、网格、方程或量纲不匹配 |
| 通量一致性：\(\hat F(c,c)=f(c)\) | 常值界面是否对应正确的物理通量 |
| 常值保持与周期守恒 | 均匀状态是否被错误改变；公共界面与通量差是否正确组装 |
| L0–L4 展开核对 | 表示展开是否保留了原来的计算 |
| 独立手算或公式对照 | 避免实现与它自己的展开一起出错 |
| 适用问题上的多步与网格细化检查 | 进一步检查稳定性、误差和组合后的行为 |

一个容易误判的反例：把 Burgers 的通量误写成 \(\hat F=u^L\)，仍能输出
正确形状，也能通过周期通量差保持总和，但它没有实现要求的 Burgers 通量。
例如 \(c=1\) 时输出 1，而正确的 \(f(1)=0.5\)。所以只看形状和守恒不够。

仓库已有的检查工具也有各自范围：

- [`contracts.py`](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/contracts.py) 的 `infer` / `checked_replace` 提供静态张量约束检查。
- [`semantics.py`](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/semantics.py) 的 `infer_semantics` / `checked_semantic_replace` 在支持的一维周期 FV/NT 模块接口上检查语义约定。
- [`ir.py`](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/ir.py) 的普通 `replace` / `rewrite` 负责改写图结构，本身不证明数值正确性。

这些静态或语义检查需要显式调用，并且依赖已声明的规则与输入假设；不要
认为一次普通的 `solve_step` 就自动完成了全部检查。语义检查也不会从任意
底层算术反推出物理含义，或证明保正性、稳定性和熵性质。

本讲只运行了上面的教学单步核对，没有进行性能比较、训练或科学实验。

## 8. 自测

1. 更换通量后结果与原算法不同，是否说明接口有错误？
2. 两个数组形状都是 N，为什么仍可能不能相连？
3. 为什么 SSP-RK3 可以共享通量模块，却不能直接共享第一次算出的通量？
4. 一个求解器保持常值和总量，是否足以证明它求解了正确的 PDE？

参考答案：1）不一定，算法改变本来就可能改变结果，要检查各自公式和性质。
2）还可能存在单元／界面位置、物理变量、索引或缩放的差异。3）三个阶段
输入状态不同，必须重新计算。4）不够，还要检查物理通量一致性及其他适用
的独立验证。

下一讲讨论可学习组件：候选算法怎样组成搜索空间，软混合与最终选出的
单一算法有什么差别。

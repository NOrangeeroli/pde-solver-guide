上一讲由我们手动指定使用哪个组件。现在把一组候选放在同一个替换位置，
让训练调整它们的权重。需要分别理解：候选是什么、混合在哪里发生、学习
什么参数，以及最终导出后实际运行什么。

本讲对照 main 的固定提交
[`20b2e3c23`](https://github.com/NOrangeeroli/meta-pde-solver/commit/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad)。
所有数值演示都是手工设定参数的教学核对，没有进行优化器训练或性能实验。

## 1. 从手工选择到可学习选择

先只考虑两个接口兼容的候选通量：Godunov 和 Rusanov。设它们对相同左右
状态分别给出 \(F_G\) 和 \(F_R\)。一种软选择是：

\[
F_{\mathrm{soft}}=w_G F_G+w_R F_R,
\qquad w_G,w_R\ge0,\qquad w_G+w_R=1.
\]

例如 \(w_G=0.75,w_R=0.25\) 表示输出由两者加权构成。它不表示“Godunov
有 75% 的概率正确”，也不是每次随机抽一个算法执行。

在本仓库的这种软图执行中，候选分支会参与计算，然后合成输出；共享的
子表达式可以复用。这与最后只保留一个候选的计算量不同。

## 2. 权重怎样变成可训练参数？

先看不启用稀疏门的情况。代码为候选保存可训练分数 \(z_k\)，常称 logits，
再用 softmax 得到权重：

\[
w_k=\frac{\exp(z_k/\tau)}{\sum_j\exp(z_j/\tau)},\qquad \tau>0.
\]

\(\tau\) 是温度。固定分数存在差异时，较小温度会使权重更集中；它不会
自动删除候选分支。若所有分数相等，改变温度仍会得到均匀权重。

取 \(\tau=1\)、\(z_G=\log3,z_R=0\)，就得到 \((0.75,0.25)\)。
训练过程可以通过下面的依赖链调整分数：

```text
候选分数 z → 混合权重 w → 混合组件输出
          → 时间推进结果 → 与目标数据的误差 → 参数梯度
```

自动微分提供当前计算路径上的梯度，优化器据此更新参数。它不会自动验证
接口含义、CFL 条件或长期稳定性，也不保证找到离散候选中的最优算法。

## 3. 两种不同的可学习参数

| 参数类型 | 在改变什么 | 仓库中的例子 |
|---|---|---|
| 候选选择参数 | 在现有候选之间分配权重 | `gate/.../logits`；启用稀疏门时还有对应参数 |
| 组件内部参数 | 改变某个候选自身的数值规则 | learned MUSCL 的 theta、learned LLF 的耗散倍率、learned WENO-Z 的 epsilon |

例如，选择 PC 还是 MUSCL，与固定使用 MUSCL 后调整 theta，是两件事。
当前目录搜索器会给部分内部参数设置范围：MUSCL theta 在 1 到 2 之间，
learned LLF 使用 `1 + exp(raw)` 作为波速倍率。这些参数化保留了部分约束，
不构成对任意组合的稳定性证明。

`architecture_parameters()` 和 `internal_parameters()` 区分这两类参数，
`model.parameters()` 则同时包含它们。

## 4. 用上一讲的数据手算软混合

仍用 PC 重构、Euler 时间推进、周期边界，以及：

\[
U=[1,2,4],\qquad \Delta t/\Delta x=0.1.
\]

上一讲得到：

\[
F_G=[0.5,2,8],\qquad F_R=[0.25,1,10.25].
\]

按 0.75 和 0.25 混合：

\[
F_{\mathrm{soft}}=[0.4375,1.75,8.5625],
\]

\[
U_{\mathrm{soft}}^{n+1}=[1.8125,1.86875,3.31875].
\]

这套周期通量差仍使用每个界面的同一个公共通量，总和仍为 7。若这时按
最大权重只选 Godunov，得到：

\[
U_{\mathrm{hard}}^{n+1}=[1.75,1.85,3.4].
\]

**软模型的输出与选定单一算法后的输出不同。** 这就是为什么要在导出后
重新检查误差与求解行为，不能把软模型的指标直接标到硬算法上。

这个单次 Euler 示例中，固定权重的通量混合也等于两个完整 Euler 结果的
同权混合，因为通量差与更新对 F 是线性的。对多阶段非线性计算，不能据此
认定“每阶段混合组件”与“最后混合完整算法结果”总是相同。

## 5. L1 与 L2 学习有什么区别？

选择发生在哪一层，决定了训练可以改变什么：

| 搜索粒度 | 一个选择位置里的候选 | 训练主要调整什么 |
|---|---|---|
| L1 模块 | PC、MUSCL、WENO 等重构模块；Godunov、LLF 等通量模块 | 完整数值模块之间的组合 |
| L2 机制 | TVD 限制器、WENO 权重规则、中心通量、耗散速度规则 | 模块内部更细的机制组合 |
| L0 方法家族 | FV、Classic、SharpClaw、DG | 不同完整计算结构之间的选择 |

所以“L2 搜索”不是简单地多放一层神经网络。它给了优化器更细的算法选择。
这种自由度会产生新的组合，也需要相应的接口和数值验证。

还有一个关键区别：**先混合重构值，再计算非线性通量，通常不等于先分别
计算通量，再混合通量。** 仅看 Burgers 的物理通量就能看到：

\[
f\left(\tfrac12\cdot1+\tfrac12\cdot3\right)=f(2)=2,
\qquad
\tfrac12 f(1)+\tfrac12 f(3)=2.5.
\]

混合位置属于算法定义的一部分。即便权重非负且和为 1，也不能自动继承
每个候选原有的精度阶、SSP、TVD、保正或熵性质。

## 6. 仓库中的两候选演示

下面直接使用仓库的 `Choice` 和 `TorchProgram`。只手工设置权重，不训练。
在含 hierarchy 的 main 检出根目录、安装了项目 Torch 依赖的环境中运行：

```python
import math
import torch
from solver_sculpt.hierarchy import ir
from solver_sculpt.hierarchy.modules import module as n
from solver_sculpt.hierarchy.trainable import Choice, MixContract, TorchProgram

u, ratio = ir.input("u"), ir.input("dt_dx")
left = n("reconstruct", u, method="pc", side="left")
right = n("reconstruct", u, method="pc", side="right")
candidates = [
    n("flux", left, right, ratio, method=method, equation="burgers")
    for method in ("godunov", "rusanov")
]
mixed_flux = Choice(
    candidates, id="flux", level=1, sparse=False,
    contract=MixContract("burgers", "face", "normal_flux"),
)
root = n("affine", u, n("divergence", mixed_flux, ratio), weights=[1, 1])
net = TorchProgram(root, {
    "gate/flux/logits": torch.tensor([[math.log(3.)], [0.]], dtype=torch.float64),
}).eval()

values = torch.tensor([1., 2., 4.], dtype=torch.float64)
soft_result = net(u=values, dt_dx=0.1)
hard_net = net.discretize()  # 这个例子选择最大权重的 Godunov。
hard_result = hard_net(u=values, dt_dx=0.1)
torch.testing.assert_close(soft_result, values.new_tensor(
    [1.8125, 1.86875, 3.31875]), rtol=0, atol=1e-14)
torch.testing.assert_close(hard_result, values.new_tensor(
    [1.75, 1.85, 3.4]), rtol=0, atol=1e-14)
print("soft", soft_result.tolist())
print("hard", hard_result.tolist())
```

`MixContract` 声明候选输出的方程、位置和量；声明本身不证明候选数学性质。
运行时还会检查候选张量是否匹配。`Choice` 的展开最终仍落到普通 IR 运算，
参数则保存在 `TorchProgram` 的可训练参数中。

注意代码先调用了 `.eval()`，结果仍然是软混合。评估模式控制稀疏门等训练／
推理行为，不等于执行候选选择。

## 7. 对应完整 Burgers catalogue

实际目录入口是 `build_burgers_catalogue_supernet`：

- `mixture_level=1` 在兼容位置选择完整数值模块。
- `mixture_level=2` 打开部分内部机制，例如 WENO 权重、中心通量与耗散速度。
- `family` 仍是 L0 选择，因为 FV、Classic、SharpClaw 和 DG 的计算结构不同。
- 当前门参数是全局的，在空间位置、左右重构和 RK 阶段间共享；并不是每个
  单元都有一个根据局部状态独立决策的网络。

该目录保留 64 个固定版本 Burgers 方法 ID 的硬选择路径；部分 ID 是别名，
因此不等于 64 个数学上互不相同的算法。覆盖约定是周期网格、float64、
外部给定相同步长等条件下的数值更新；它不自动复制原求解器的时间步控制器。

为同时表达 DG 与其他方法，其内部状态为 `[..., 3, N]`，保存单元平均、
持续演化的 P1 斜率与初始 LF 波速。这不是三个物理守恒变量。调用时应在
整段轨迹开始时 `initialize` 一次，用 `observe` 取出单元平均；每步重新
初始化会破坏需要保留的状态。

目录默认 `sparse=True`，会在 softmax 权重之外加入稀疏门、再归一化；因此
第 2 节的简单公式对应显式设置 `sparse=False` 的教学情形。稀疏门使权重
变小或归零，也不意味着当前解释器已跳过这些候选的求值。

## 8. 几个名字相近、作用不同的操作

| 操作 | 实际含义 |
|---|---|
| `initialization="mp5"` | 初始分数偏向 MP5 路径，软模型仍可能混入其他候选 |
| `net.eval()` | 切换评估行为；不移除候选 |
| `net.freeze()` | 将当前确定性参数与门值写成常量图；仍可保留软混合 |
| `net.discretize()` | 每个选择位置按当前规则选一个候选，删除未选分支与无用参数 |
| `net.select_solver("mp5_llf")` | 按目录中指定方法的明确选择组合生成硬路径 |

`discretize()` 默认按各选择位置的有效权重取最大值；启用稀疏门时也考虑
确定性门值。这是局部选择规则，不是对所有离散组合逐一验证后的全局最优
结论。新选出的路径还应使用合适的控制器，单独验证误差、稳定性和实际成本。

成本也要区分：训练可能使用门数、运算数或其他可微代理；这些量不自动
等于 CPU 时间。软图、冻结软图、硬选择图应分别说明实际执行了哪些分支。

源码与版本说明：[Choice 与 TorchProgram](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/trainable.py)、
[Burgers catalogue 构造与导出](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/solver_sculpt/hierarchy/burgers_catalogue_supernet.py)、
[目录范围与验证约定](https://github.com/NOrangeeroli/meta-pde-solver/blob/20b2e3c2372ee3b76b9450ba95cafdaefb6694ad/docs/hierarchy/burgers_catalogue/README.md)。

## 9. 自测

1. Godunov 权重为 0.75，是否表示本次只运行 Godunov？
2. 权重越来越集中，是否等于程序已经变快？
3. 训练时误差很小，选出单一算法后是否可以沿用该误差数字？
4. 同一组权重放在重构输出和通量输出处，是否一定得到同一算法？

参考答案：1）软混合仍计算候选并加权。2）不一定，要看实际图是否移除了
分支以及执行成本。3）需要重新测量，硬路径输出可能变化。4）不一定，
非线性计算通常不能与混合交换顺序。

课程到这里结束。可以继续阅读组件 DSL 的接口图解，或通过 HyperBench 文档了解评测流程。

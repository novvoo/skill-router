# HACPO: Optimized Specification

This file refines the original HACPO (Hybrid Adaptive Contrastive Policy Optimization) objective: we 1) unify notation, 2) make clipping/PPO mechanics explicit, 3) define the contrastive term and weights, 4) give practical hyperparameter suggestions and 5) provide implementation notes and pseudocode.

## Notation (unified).

- • θ: policy parameters for πθ(y | x).
- • πref : reference / behavior policy (fixed when computing ratios).
- • ri(θ) =

πθ(yi | xi) πref(yi | xi)

: importance / policy ratio for supervised sample (xi,yi).

- • rj(k)(θ) =

πθ(yj,k | xj) πref(yj,k | xj)

: ratio for the k-th contrastive (negative) sample associated with context xj.

- • Aˆi: estimated (possibly generalized) advantage for sample i. Use the same notation for all advantages for clarity.
- • wj,k ≥ 0: weight for contrastive sample yj,k; we require k wj,k = 1 for each context j.
- • Clip interval parameter ϵ > 0; define clipϵ(r) = clip(r, 1 − ϵ, 1 + ϵ).
- • LCPO : contrastive policy optimization loss (defined below).
- • DKL(πref∥πθ) : KL divergence used as a constraint/penalty. (See note about direction and sign.)


# Objective

We present the HACPO objective in a form consistent with PPO-style clipping and with an explicit contrastive term.

i,yi)∼D αi · min ri(θ)Aˆi, clipϵ(ri(θ))Aˆi

JHACPO(θ) = E(x

supervised/PPO-clip term

K

wi,k min ri(k)(θ)Aˆ(ik), clipϵ(ri(k)(θ))Aˆ(ik)

(1)

+ (1 − αi) ·

k=1

contrastive importance-sampled PPO-clip

+ γ Ex

i∼D,{yi,k}∼A LCPO(θ; xi,{yi,k}) − βKL DKL πref ∥ πθ .

Notes on signs and KL direction: Many RL formulations either maximize an objective (PPO) or minimize a loss. Above we write JHACPO as an objective to maximize; the KL term is written as a penalty by subtracting βKLDKL(πref∥πθ). If you implement using gradient descent on a loss, negate JHACPO accordingly. We use DKL(πref∥πθ) so that the penalty encourages πθ to stay close to the reference policy [?].

# Contrastive loss: LCPO

One practical choice for the contrastive policy loss (inspired by InfoNCE-style contrastive objectives, adapted to policies) is:

where:

exp sθ(x,y+)/τc exp sθ(x,y+)/τc + Kk=1 exp sθ(x,yk−)/τc

, (2)

LCPO(θ;x,{yk}) = −log

- • y+ is the positive (target) sample (usually the reference y),


- • yk− are negative samples drawn from A (or from the current mini-batch),
- • sθ(x,y) = log πθ(y x) (or any scalar scoring function correlated with log-probability),
- • τc > 0 is a temperature for the contrastive softmax.


This choice encourages the policy to assign higher relative probability to positive examples than to negatives. Alternatively, you can use margin-based or pairwise losses depending on your task.

# Weights wi,k and negative sampling strategy

- • Uniform weights: wi,k = 1/K is simple and stable.
- • Similarity-based weights: compute similarity scores (e.g. using sθ or an auxiliary encoder) and convert to weights via softmax:

wi,k

exp ϕ(xi,yi,k) K ℓ=1 exp ϕ(xi,yi,ℓ)

.

This emphasizes “hard” negatives.

- • Batch negative strategy: use other examples in the mini-batch as negatives to avoid extra sampling overhead.


Always normalize wi,k so k wi,k = 1 for numerical stability.

# Adaptive mixture coeﬀicient αi

To adapt the relative importance of the supervised vs contrastive terms, define αi per sample. One robust choice:

ℓ(xi,yi) − τ

β′ , (3) where ℓ(x,y) is a sample-level signal (e.g. token length |y|, or a diﬀiculty score such as negative log-likelihood

αi = σ

under reference policy), τ a threshold, and β′ a temperature controlling smoothness. Practical recommendations:

- • If ℓ = |y| (sequence length), tune τ on a validation set (512 is task dependent).
- • Consider alternate signals: model confidence, reference log-prob, or validation loss per example.
- • Optionally clip αi ∈ [αmin,αmax] to avoid extremes.
- • You can also schedule α over training steps (e.g. slowly move from supervised-heavy to contrastive-heavy).


# Hyperparameter defaults & practical guidance

- • ϵ (PPO clip): common values 0.1–0.2; start with 0.1.
- • K (negatives per context): 4 16; prefer batch negatives when K large.
- • γ (weight for LCPO): start with 0.1 0.5; tune to balance supervised vs contrastive objectives.
- • βKL: if used, adaptively adjust as in PPO-penalty variants: if observed KL >target, increase βKL; otherwise decrease.
- • Optimizer: Adam / AdamW with learning rate tuned separately for policy and for any encoder used by contrastive loss.
- • Advantage estimation: use GAE (generalized advantage estimation) to reduce variance.


# Stability considerations and implementation tricks

- • Gradient conflicts: supervised and contrastive gradient directions can conflict. Consider alternating updates (one step supervised PPO-clip, one step contrastive) or use gradient surgery techniques if conflicts are severe.
- • Clipping and zero gradients: when ratios are clipped, gradient contributions from those samples are limited. Monitor fraction of clipped updates; if too high, reduce learning rate or increase ϵ.
- • Value normalization: normalize advantages (zero mean, unit variance) per batch to stabilize scale.
- • Use mini-batch vectorization: compute ratios and clip operations in a vectorized way for speed.
- • Monitoring: track (1) average KL, (2) fraction clipped, (3) contrastive loss magnitude, (4) supervised PPO loss magnitude. Keep their scales comparable by tuning γ and βKL.


# Pseudocode (sketch)

Algorithm 1 HACPO Training Step (sketch) Require: dataset D, contrastive generator A, batch size B, negatives K

- 1: for each training iteration do
- 2: Sample batch {(xi,yi)}Bi=1 from D
- 3: For each i, sample negatives {yi,k}Kk=1 ∼ A (or use batch negatives)
- 4: Compute reference probabilities / log-probs under πref
- 5: Compute current log-probs under πθ and ratios ri, ri(k)
- 6: Compute advantages Aˆi, and (optionally) Aˆ(ik) for negatives
- 7: Compute αi per Eq.(3)
- 8: Compute supervised PPO-clip term and contrastive PPO-clip term (vectorized)
- 9: Compute LCPO per Eq.(2)
- 10: J ← average objective per Eq.(1)
- 11: Take gradient step to maximize J (or minimize −J)
- 12: Update βKL adaptively if using KL-penalty scheme
- 13: end for


# Summary of improvements over original spec

- • Unified notation for ratios and advantages to avoid ambiguity.
- • Explicit clip interval and PPO-style clipping semantics.
- • Concrete contrastive loss (InfoNCE-style) option and weight normalization.
- • Practical hyperparameter defaults and stability/implementation guidance.
- • Pseudocode to reduce misinterpretation at implementation time.



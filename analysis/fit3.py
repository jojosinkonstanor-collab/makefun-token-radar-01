import json, math, statistics, random
from datetime import date
s=json.load(open('/home/hatch/workspace/makefun/kit-token-radar-01/token-radar-01-kit/input/snapshot.json'))
ps=s['protocols']; asof=date.fromisoformat(s['as_of'])
live=[p for p in ps if p['mcap_usd'] and p['mcap_usd']>0 and p['tvl_usd']>0 and p['category']!='CEX']
def age(p): return max(0,(asof-date.fromisoformat(p['listed_at'])).days) if p['listed_at'] else None
for p in live:
    p['_y']=math.log(p['mcap_usd']/p['tvl_usd']); p['_lt']=math.log(p['tvl_usd'])
    p['_age']=age(p); p['_g']=p['change_7d'] if p['change_7d'] is not None else 0.0
    p['_nch']=len(p['chains'])
def ols(X,y):
    k=len(X[0]); n=len(X)
    A=[[sum(X[r][i]*X[r][j] for r in range(n)) for j in range(k)]+[sum(X[r][i]*y[r] for r in range(n))] for i in range(k)]
    for i in range(k): A[i][i]+=1e-8
    for i in range(k):
        piv=max(range(i,k),key=lambda r:abs(A[r][i])); A[i],A[piv]=A[piv],A[i]
        d=A[i][i]; A[i]=[v/d for v in A[i]]
        for r in range(k):
            if r!=i and A[r][i]!=0:
                f=A[r][i]; A[r]=[a-f*b for a,b in zip(A[r],A[i])]
    return [A[i][k] for i in range(k)]
def pred(b,x): return sum(a*v for a,v in zip(b,x))
LT0=statistics.median([p['_lt'] for p in live])
def feats(p, spec):
    x=[1.0, p['_lt']-LT0]
    if 'chains' in spec: x.append(min(p['_nch']-1,3)/3)
    if 'growth' in spec: x.append(max(-0.3,min(0.3,p['_g']/100)))
    if 'age' in spec: x.append(math.log1p(p['_age'] if p['_age'] is not None else 365)/math.log(1096))
    return x
def loo(spec):
    e=[]
    for i,p in enumerate(live):
        tr=[q for j,q in enumerate(live) if j!=i]
        b=ols([feats(q,spec) for q in tr],[q['_y'] for q in tr])
        e.append(p['_y']-pred(b,feats(p,spec)))
    return statistics.median([abs(x) for x in e]), math.sqrt(sum(x*x for x in e)/len(e))
def wf(spec, cutoff):
    dated=[p for p in live if p['_age'] is not None]
    tr=[p for p in dated if p['_age']>=cutoff]; te=[p for p in dated if p['_age']<cutoff]
    b=ols([feats(p,spec) for p in tr],[p['_y'] for p in tr])
    e=[p['_y']-pred(b,feats(p,spec)) for p in te]
    return statistics.median([abs(x) for x in e]), math.sqrt(sum(x*x for x in e)/len(e)), len(tr), len(te)
for spec in [['chains'],['growth'],['age'],['chains','growth'],['chains','age']]:
    print(spec, 'LOO med/rmse:', tuple(round(v,3) for v in loo(spec)),
          'WF730:', tuple(round(v,3) for v in wf(spec,730)[:2]),
          'WF365:', tuple(round(v,3) for v in wf(spec,365)[:2]))
b=ols([feats(p,['chains']) for p in live],[p['_y'] for p in live])
print('size+chains full-fit beta:', [round(v,3) for v in b])
# bootstrap rank ranges under size+chains
b3=json.load(open('/home/hatch/workspace/makefun/token-radar-01/out/board.json'))['rows']
rng=random.Random(1234)
ranks={r['slug']: [] for r in b3}
for _ in range(200):
    tr=[live[rng.randrange(len(live))] for _ in range(len(live))]
    bb=ols([feats(p,['chains']) for p in tr],[p['_y'] for p in tr])
    scored=[]
    for r in b3:
        ch=min((len(r['chains'])-1),3)/3 if r['chains'] else 0
        ratio=math.exp(bb[0]+bb[1]*(math.log(r['tvl_usd'])-LT0)+bb[2]*ch)
        scored.append((r['tvl_usd']*ratio, r['slug']))
    scored.sort(key=lambda t:(-t[0],t[1]))
    for i,(v,slug) in enumerate(scored): ranks[slug].append(i+1)
widths=[]
for r in b3:
    arr=sorted(ranks[r['slug']])
    widths.append(arr[190]-arr[9])
print('size+chains rank-range width: median', statistics.median(widths), 'p90', sorted(widths)[int(0.9*len(widths))], 'max', max(widths))
print('sample ranges:', [(r['name'],r['rank'],sorted(ranks[r['slug']])[9],sorted(ranks[r['slug']])[190]) for r in b3[:5]])
print('mid-board sample:', [(r['name'],r['rank'],sorted(ranks[r['slug']])[9],sorted(ranks[r['slug']])[190]) for r in b3[85:90]])
# deploy-share distribution under size-only implied
for r in b3:
    r['dep']=(r['farm']['gas_total_usd']+r['farm']['capital_usd'])/r['implied_value_usd']
ds=sorted(r['dep'] for r in b3)
print('deploy share: min %.2e p25 %.2e p50 %.2e p75 %.2e max %.2e'%(ds[0],ds[len(ds)//4],ds[len(ds)//2],ds[3*len(ds)//4],ds[-1]))
for t1,t2 in [(5e-6,1.5e-5),(1e-5,3e-5),(8e-6,2e-5)]:
    print(f"thresholds {t1:.0e}/{t2:.0e}: FARM~{sum(1 for d in ds if d<=t1)} THIN~{sum(1 for d in ds if t1<d<=t2)} SKIP~{sum(1 for d in ds if d>t2)} (before rank rule)")

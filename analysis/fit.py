import json, math, statistics
from datetime import date

s=json.load(open('/home/hatch/workspace/makefun/kit-token-radar-01/token-radar-01-kit/input/snapshot.json'))
ps=s['protocols']; asof=date.fromisoformat(s['as_of'])
live=[p for p in ps if p['mcap_usd'] and p['mcap_usd']>0 and p['tvl_usd']>0 and p['category']!='CEX']
print('train n =', len(live))
def age(p):
    if not p['listed_at']: return None
    return max(0,(asof-date.fromisoformat(p['listed_at'])).days)
for p in live:
    p['_y']=math.log(p['mcap_usd']/p['tvl_usd'])
    p['_lt']=math.log(p['tvl_usd'])
    p['_age']=age(p)
    p['_g']=p['change_7d'] if p['change_7d'] is not None else 0.0
    p['_nch']=len(p['chains'])

def ols(X, y):
    n=len(X); k=len(X[0])
    A=[[sum(X[r][i]*X[r][j] for r in range(n)) for j in range(k)]+[sum(X[r][i]*y[r] for r in range(n))] for i in range(k)]
    for i in range(k): A[i][i]+=1e-8
    for i in range(k):
        piv=max(range(i,k), key=lambda r: abs(A[r][i])); A[i],A[piv]=A[piv],A[i]
        d=A[i][i]
        A[i]=[v/d for v in A[i]]
        for r in range(k):
            if r!=i and A[r][i]!=0:
                f=A[r][i]; A[r]=[a-f*b for a,b in zip(A[r],A[i])]
    return [A[i][k] for i in range(k)]
def predict(beta, x): return sum(b*v for b,v in zip(beta,x))

cats=sorted(set(p['category'] for p in live if p['category']))
cat_idx={c:i for i,c in enumerate(cats)}
LT0=statistics.median([p['_lt'] for p in live])
def feats(p, spec):
    x=[1.0]
    if 'size' in spec: x.append(p['_lt']-LT0)
    if 'cat' in spec:
        v=[0.0]*len(cats)
        if p['category'] in cat_idx: v[cat_idx[p['category']]]=1.0
        x+=v
    if 'growth' in spec: x.append(max(-60,min(120,p['_g']))/100)
    if 'age' in spec: x.append(math.log1p(p['_age'] if p['_age'] is not None else 365)/math.log(1096))
    if 'chains' in spec: x.append(min(p['_nch']-1,3)/3)
    return x

def loo(spec):
    errs=[]
    for i,p in enumerate(live):
        tr=[q for j,q in enumerate(live) if j!=i]
        X=[feats(q,spec) for q in tr]; y=[q['_y'] for q in tr]
        b=ols(X,y)
        errs.append(p['_y']-predict(b,feats(p,spec)))
    return errs
def medabs(e): return statistics.median([abs(x) for x in e])
def rmse(e): return math.sqrt(sum(x*x for x in e)/len(e))

gmed=statistics.median([p['_y'] for p in live])
e0=[p['_y']-gmed for p in live]
print(f"M0 global median      LOO med|e|={medabs(e0):.3f} rmse={rmse(e0):.3f}")
e1=[]
for i,p in enumerate(live):
    vals=[q['_y'] for j,q in enumerate(live) if j!=i and q['category']==p['category']]
    m=statistics.median(vals) if len(vals)>=3 else gmed
    e1.append(p['_y']-m)
print(f"M1 category median    LOO med|e|={medabs(e1):.3f} rmse={rmse(e1):.3f} (radar-2)")

for spec in [['size'],['size','cat'],['size','growth'],['size','age'],['size','chains'],
             ['size','growth','age','chains'],['size','cat','growth'],['size','cat','growth','age','chains']]:
    e=loo(spec)
    print(f"{'M:'+','.join(spec):38s} LOO med|e|={medabs(e):.3f} rmse={rmse(e):.3f}")

for spec in [['size'],['size','growth','age','chains'],['size','cat','growth','age','chains']]:
    X=[feats(p,spec) for p in live]; y=[p['_y'] for p in live]
    b=ols(X,y)
    print(spec, 'beta=', [round(v,3) for v in b[:6]], '... ncoef=', len(b))

dated=[p for p in live if p['_age'] is not None]
for cutoff_days in (365, 730):
    tr=[p for p in dated if p['_age']>=cutoff_days]
    te=[p for p in dated if p['_age']<cutoff_days]
    if len(tr)<20 or len(te)<10:
        print('WF cutoff',cutoff_days,'too small',len(tr),len(te)); continue
    for spec in [[],['size'],['size','growth','age','chains'],['size','cat','growth','age','chains']]:
        if not spec:
            m=statistics.median([p['_y'] for p in tr])
            e=[p['_y']-m for p in te]
            print(f"WF age>={cutoff_days}d train={len(tr)} test={len(te)} global-median med|e|={medabs(e):.3f} rmse={rmse(e):.3f}")
        else:
            X=[feats(p,spec) for p in tr]; y=[p['_y'] for p in tr]
            b=ols(X,y)
            e=[p['_y']-predict(b,feats(p,spec)) for p in te]
            print(f"WF age>={cutoff_days}d train={len(tr)} test={len(te)} {','.join(spec):28s} med|e|={medabs(e):.3f} rmse={rmse(e):.3f}")

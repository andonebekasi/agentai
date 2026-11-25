# AWS FinOps Reference Guide (`aws` CLI)

Panduan teknis perintah native `aws` CLI untuk audit FinOps, eliminasi pemborosan, rightsizing, dan analisis komitmen diskon.

---

## 1. Autentikasi & Verifikasi Akun

```bash
# Verifikasi identitas caller & account ID
aws sts get-caller-identity --output table

# Cek region aktif
aws configure get region
```

---

## 2. Visibilitas Biaya & Tagihan (AWS Cost Explorer)

### Total Biaya Bulan Berjalan (Month-to-Date)
```bash
START_DATE=$(date -d "$(date +%Y-%m-01)" +%Y-%m-%d)
END_DATE=$(date +%Y-%m-%d)

aws ce get-cost-and-usage \
  --time-period Start=${START_DATE},End=${END_DATE} \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --output json
```

### Biaya per Layanan (Service Breakdown Top 10)
```bash
aws ce get-cost-and-usage \
  --time-period Start=${START_DATE},End=${END_DATE} \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query "ResultsByTime[0].Groups | sort_by(@, &Metrics.UnblendedCost.Amount) | reverse(@)[0:10]" \
  --output table
```

### Proyeksi Biaya Akhir Bulan (Forecast)
```bash
END_OF_MONTH=$(date -d "$(date +%Y-%m-01) +1 month -1 day" +%Y-%m-%d)

aws ce get-cost-forecast \
  --time-period Start=$(date +%Y-%m-%d),End=${END_OF_MONTH} \
  --metric "UNBLENDED_COST" \
  --granularity MONTHLY
```

### Cek AWS Budgets
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
aws budgets describe-budgets --account-id "$ACCOUNT_ID" --output table
```

---

## 3. Deteksi Pemborosan (Waste & Orphaned Resources)

### A. Unattached EBS Volumes (Volume Tersedia Tanpa Instance)
Volume berstatus `available` tetap memungut biaya penyimpanan per GB-bulan tanpa menghasilkan nilai bisnis:
```bash
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query "Volumes[*].{VolumeId:VolumeId,SizeGB:Size,Type:VolumeType,IOPS:Iops,Created:CreateTime,Name:Tags[?Key=='Name'].Value|[0]}" \
  --output table
```

### B. Unassociated Elastic IP Addresses (EIP Menganggur)
AWS mengenakan biaya sewa untuk Elastic IP publik yang dialokasikan tetapi tidak di-attach ke instance yang berjalan:
```bash
aws ec2 describe-addresses \
  --query "Addresses[?AssociationId==null].{PublicIp:PublicIp,AllocationId:AllocationId,NetworkBorderGroup:NetworkBorderGroup}" \
  --output table
```

### C. EC2 Instances yang Terhenti (Stopped)
Instance yang di-stop tidak dikenakan biaya komputasi, namun volume EBS root & secondary volume tetap ditagihkan penuh:
```bash
aws ec2 describe-instances \
  --filters Name=instance-state-name,Values=stopped \
  --query "Reservations[*].Instances[*].{InstanceId:InstanceId,InstanceType:InstanceType,LaunchTime:LaunchTime,Name:Tags[?Key=='Name'].Value|[0]}" \
  --output table
```

### D. Snapshot EBS Usang / Lama
Snapshot yang berumur lebih dari 90 hari tanpa keterkaitan dengan AMI aktif:
```bash
NINETY_DAYS_AGO=$(date -d "90 days ago" +%Y-%m-%d)
aws ec2 describe-snapshots \
  --owner-ids self \
  --query "Snapshots[?StartTime<='${NINETY_DAYS_AGO}'].{SnapshotId:SnapshotId,VolumeSize:VolumeSize,StartTime:StartTime,Description:Description}" \
  --output table
```

### E. Classic / Idle Load Balancers
```bash
aws elbv2 describe-load-balancers \
  --query "LoadBalancers[*].{Name:LoadBalancerName,DNS:DNSName,Type:Type,State:State.Code}" \
  --output table
```

---

## 4. Rightsizing (AWS Compute Optimizer)

Compute Optimizer menganalisis metrik CloudWatch selama 14-30 hari dan memberikan rekomendasi downgrade / cross-family:

```bash
# Rekomendasi EC2 yang over-provisioned (Bisa di-downsize untuk hemat biaya)
aws compute-optimizer get-ec2-instance-recommendations \
  --query "instanceRecommendations[?finding=='OVER_PROVISIONED'].{InstanceId:instanceId,CurrentType:currentInstanceType,Finding:finding,RecommendedType:recommendationOptions[0].instanceType,ProjectedCostSaving:recommendationOptions[0].projectedUtilizationMetrics}" \
  --output table

# Rekomendasi Auto Scaling Group
aws compute-optimizer get-auto-scaling-group-recommendations --output table

# Rekomendasi EBS Volume (EBS rightsizing IOPS & Throughput)
aws compute-optimizer get-ebs-volume-recommendations --output table
```

---

## 5. Komitmen Diskon (Savings Plans & Reserved Instances)

```bash
# Cek Savings Plans yang aktif
aws savingsplans describe-savings-plans \
  --filters Name=savings-plan-state,Values=active \
  --output table

# Rekomendasi pembelian Savings Plans
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --output json

# Cek Reserved Instances aktif
aws ec2 describe-reserved-instances \
  --filters Name=state,Values=active \
  --query "ReservedInstances[*].{ID:ReservedInstanceId,Type:InstanceType,Count:InstanceCount,Scope:Scope,End:End}" \
  --output table
```

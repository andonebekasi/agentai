---
name: finops-cloud
description: Multi-Cloud FinOps skill for cost optimization, waste detection, budget tracking, and sizing recommendations across AWS, GCP, Azure, OCI, and Tencent Cloud using native cloud CLIs.
---

# Multi-Cloud FinOps Skill (Cloud Native CLI)

Skill ini memandu AI Agent dalam menerapkan prinsip **FinOps (Cloud Financial Operations)** secara komprehensif pada 5 penyedia cloud utama (**AWS**, **GCP**, **Azure**, **OCI**, dan **Tencent Cloud**) menggunakan **CLI Cloud Native** (`aws`, `gcloud`, `az`, `oci`, `tccli`).

## 🎯 Siklus FinOps (Inform, Optimize, Operate)

1. **Inform (Visibilitas Biaya & Alokasi)**:
   - Mengumpulkan data tagihan (billing), tren pengeluaran, pemakaian berjalan (MTD - Month to Date), dan proyeksi biaya.
   - Memeriksa budget alerts dan anomali biaya.
2. **Optimize (Eliminasi Pemborosan & Rightsizing)**:
   - Mengidentifikasi sumber daya terlantar (*orphaned / idle resources*): disk/volume yang tidak terpasang, IP publik statis yang tidak terasosiasi, snapshot usang, load balancer tanpa traffic, dan instance yang terhenti (*stopped*).
   - Menganalisis rekomendasi rightsizing (Compute Optimizer, GCP Recommender, Azure Advisor, OCI Optimizer).
   - Mengevaluasi komitmen diskon (Savings Plans, Reserved Instances, CUDs).
3. **Operate (Otomasi & Governance)**:
   - Menghasilkan laporan audit berkala (Markdown / JSON).
   - Memberikan rekomendasi tindakan prioritas berdasarkan potensi penghematan (*Quick Wins* vs *Architectural Changes*).

---

## 🚀 Skrip Audit Otomatis Multi-Cloud

Di folder `scripts/` tersedia skrip audit otomatis yang dapat langsung dijalankan oleh Agent maupun pengguna:

```bash
# 1. Periksa status instalasi & autentikasi seluruh Cloud CLI (AWS, GCP, Azure, OCI, Tencent)
./scripts/finops_audit.sh check

# 2. Jalankan audit FinOps untuk semua cloud yang aktif
./scripts/finops_audit.sh all

# 3. Jalankan audit spesifik per cloud provider
./scripts/finops_audit.sh aws
./scripts/finops_audit.sh gcp
./scripts/finops_audit.sh azure
./scripts/finops_audit.sh oci
./scripts/finops_audit.sh tencent
```

---

## ☁️ Ringkasan Perintah CLI Cloud Native per Provider

### 1. AWS (Amazon Web Services) — `aws` CLI
- **Biaya & Tagihan**:
  ```bash
  # Total biaya bulan berjalan (MTD)
  aws ce get-cost-and-usage \
    --time-period Start=$(date -d "$(date +%Y-%m-01)" +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity MONTHLY \
    --metrics "UnblendedCost"
  ```
- **Deteksi Sumber Daya Terlantar (Waste Detection)**:
  - *EBS Volume Tidak Terpasang (Available)*:
    `aws ec2 describe-volumes --filters Name=status,Values=available --query "Volumes[*].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime}" --output table`
  - *Elastic IP (EIP) Tidak Terasosiasi*:
    `aws ec2 describe-addresses --query "Addresses[?AssociationId==null].{IP:PublicIp,AllocationId:AllocationId}" --output table`
  - *EC2 Instance Berhenti (Stopped tapi EBS tetap bayar)*:
    `aws ec2 describe-instances --filters Name=instance-state-name,Values=stopped --query "Reservations[*].Instances[*].{ID:InstanceId,Type:InstanceType,Name:Tags[?Key=='Name'].Value|[0]}" --output table`
- **Rekomendasi Compute Optimizer**:
  `aws compute-optimizer get-ec2-instance-recommendations --query "instanceRecommendations[?finding!='OPTIMIZED']"`

*Panduan lengkap AWS*: Lihat [references/aws-finops.md](file:///home/andi/script/poc-aws/agentai/tmpt/agentai/.agents/skills/finops-cloud/references/aws-finops.md).

---

### 2. GCP (Google Cloud Platform) — `gcloud` CLI
- **Tagihan & Akun Billing**:
  `gcloud billing accounts list`
  `gcloud billing budgets list --billing-account=<BILLING_ACCOUNT_ID>`
- **Deteksi Sumber Daya Terlantar**:
  - *Persistent Disk Tidak Terpasang*:
    `gcloud compute disks list --filter="-users:*" --format="table(name,sizeGb,type,zone,status)"`
  - *Static IP Tidak Dipakai (RESERVED)*:
    `gcloud compute addresses list --filter="status=RESERVED" --format="table(name,address,region,status)"`
  - *Instance Dihentikan (TERMINATED)*:
    `gcloud compute instances list --filter="status=TERMINATED" --format="table(name,zone,machineType)"`
- **GCP Recommender (Idle VM & Rightsizing)**:
  `gcloud recommender recommendations list --project=<PROJECT_ID> --location=<LOCATION> --recommender=google.compute.instance.IdleResourceRecommender --format=json`
  `gcloud recommender recommendations list --project=<PROJECT_ID> --location=<LOCATION> --recommender=google.compute.instance.MachineTypeRecommender --format=json`

*Panduan lengkap GCP*: Lihat [references/gcp-finops.md](file:///home/andi/script/poc-aws/agentai/tmpt/agentai/.agents/skills/finops-cloud/references/gcp-finops.md).

---

### 3. Azure — `az` CLI
- **Biaya & Konsumsi**:
  `az costmanagement query --type Usage --timeframe MonthToDate --dataset-aggregation '{"totalCost":{"name":"PreTaxCost","function":"Sum"}}'`
  `az consumption budget list`
- **Deteksi Sumber Daya Terlantar**:
  - *Unattached Managed Disks*:
    `az disk list --query "[?managedBy==null].{Name:name,SizeGB:diskSizeGb,Sku:sku.name,ResourceGroup:resourceGroup}" --output table`
  - *Unassociated Public IPs*:
    `az network public-ip list --query "[?ipConfiguration==null].{Name:name,IP:ipAddress,ResourceGroup:resourceGroup}" --output table`
  - *Unattached Network Interfaces (NIC)*:
    `az network nic list --query "[?virtualMachine==null].{Name:name,ResourceGroup:resourceGroup}" --output table`
  - *VM Deallocated (Tetap bayar disk/IP)*:
    `az vm list -d --query "[?powerState=='VM deallocated'].{Name:name,Size:hardwareProfile.vmSize,ResourceGroup:resourceGroup}" --output table`
- **Azure Advisor Cost Recommendations**:
  `az advisor recommendation list --category Cost --query "[].{Impact:impact,Problem:shortDescription.problem,Solution:shortDescription.solution}" --output table`

*Panduan lengkap Azure*: Lihat [references/azure-finops.md](file:///home/andi/script/poc-aws/agentai/tmpt/agentai/.agents/skills/finops-cloud/references/azure-finops.md).

---

### 4. OCI (Oracle Cloud Infrastructure) — `oci` CLI
- **Biaya & Penggunaan (Usage API)**:
  ```bash
  oci usage-api usage-summary request-summarized-usages \
    --tenant-id <TENANCY_OCID> \
    --time-usage-started $(date -d "30 days ago" +%Y-%m-%dT00:00:00Z) \
    --time-usage-ended $(date +%Y-%m-%dT00:00:00Z) \
    --granularity MONTHLY
  ```
- **Deteksi Sumber Daya Terlantar**:
  - *Block Volume Tidak Terpasang (AVAILABLE)*:
    `oci bv volume list --compartment-id <COMPARTMENT_ID> --lifecycle-state AVAILABLE --all --query "data[].{ID:id,Name:\"display-name\",SizeGB:\"size-in-gbs\",TimeCreated:\"time-created\"}" --output table`
  - *Public Reserved IP Tidak Terikat*:
    `oci network public-ip list --scope REGION --compartment-id <COMPARTMENT_ID> --lifetime RESERVED --all --query "data[?\"assigned-entity-id\"==null].{IP:\"ip-address\",Name:\"display-name\"}" --output table`
- **OCI Optimizer (Rekomendasi Biaya)**:
  `oci optimizer recommendation list --compartment-id <TENANCY_OCID> --category-name cost --all`

*Panduan lengkap OCI*: Lihat [references/oci-finops.md](file:///home/andi/script/poc-aws/agentai/tmpt/agentai/.agents/skills/finops-cloud/references/oci-finops.md).

---

### 5. Tencent Cloud — `tccli` CLI
- **Billing & Tagihan**:
  `tccli billing DescribeBillSummaryByProduct --BeginMonth $(date +%Y-%m)`
  `tccli billing DescribeCostSummaryByProduct --BeginMonth $(date +%Y-%m)`
- **Deteksi Sumber Daya Terlantar**:
  - *CBS Disks Tidak Terpasang (UNATTACHED)*:
    `tccli cbs DescribeDisks --Filters '[{"Name":"disk-state","Values":["UNATTACHED"]}]'`
  - *Elastic IP (EIP) Tidak Terikat (UNBIND)*:
    `tccli vpc DescribeAddresses --Filters '[{"Name":"address-status","Values":["UNBIND"]}]'`
  - *CVM Instance Berhenti (STOPPED)*:
    `tccli cvm DescribeInstances --Filters '[{"Name":"instance-state","Values":["STOPPED"]}]'`

*Panduan lengkap Tencent Cloud*: Lihat [references/tencent-finops.md](file:///home/andi/script/poc-aws/agentai/tmpt/agentai/.agents/skills/finops-cloud/references/tencent-finops.md).

---

## 📋 Format Laporan FinOps yang Dihasilkan

Ketika pengguna meminta audit atau analisa FinOps, susun laporan dengan struktur berikut:

1. **Executive Summary**: Total estimasi pengeluaran bulanan, total potensi penghematan bulanan ($/Rp).
2. **Waste Audit Breakdown**:
   - Disks / Volumes tidak terpasang (Jumlah & estimasi biaya/bulan).
   - Unassociated Static/Elastic IPs.
   - Stopped Compute Instances yang menahan disk berbayar.
   - Snapshots usang (>90 hari tanpa backup policy).
3. **Rightsizing & Advisor Recommendations**: Rekomendasi downgrade instance over-provisioned.
4. **Commitment & Discount Opportunities**: Rekomendasi Reserved Instance / Savings Plans / CUDs.
5. **Action Plan (Prioritas Eksekusi)**:
   - *P0 (Quick Wins)*: Hapus unattached disk & lepaskan unassociated IP (langsung hemat tanpa downtime).
   - *P1 (Safe Optimizations)*: Hentikan instance idle atau snapshot instance lalu terminate.
   - *P2 (Architectural / Commitments)*: Rightsizing CPU/RAM dan kunci komitmen 1-3 tahun.

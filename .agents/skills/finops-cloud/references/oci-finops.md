# OCI FinOps Reference Guide (`oci` CLI)

Panduan teknis perintah native `oci` (Oracle Cloud Infrastructure CLI) untuk audit FinOps, eliminasi pemborosan, rightsizing, dan analisis pengeluaran cloud.

---

## 1. Autentikasi & Verifikasi Tenancy

```bash
# Verifikasi konfigurasi OCI CLI
oci os ns get

# Ambil OCID Tenancy
TENANCY_OCID=$(oci iam compartment list --all --query "data[0].\"compartment-id\"" --output text 2>/dev/null || cat ~/.oci/config | grep tenancy | cut -d= -f2 | tr -d ' ')
echo "Tenancy OCID: $TENANCY_OCID"
```

---

## 2. Visibilitas Biaya & Tagihan (OCI Usage API & Budgets)

```bash
# Ringkasan Biaya Bulanan (Usage Summary)
START_TIME=$(date -d "30 days ago" +%Y-%m-%dT00:00:00Z)
END_TIME=$(date +%Y-%m-%dT00:00:00Z)

oci usage-api usage-summary request-summarized-usages \
  --tenant-id "$TENANCY_OCID" \
  --time-usage-started "$START_TIME" \
  --time-usage-ended "$END_TIME" \
  --granularity MONTHLY \
  --query-type COST \
  --output table

# Cek Budgets yang telah dikonfigurasi
oci budgets budget list \
  --compartment-id "$TENANCY_OCID" \
  --output table

# Cek Alert Rules pada Budget
BUDGET_ID="<BUDGET_OCID>"
oci budgets alert-rule list --budget-id "$BUDGET_ID" --output table
```

---

## 3. Deteksi Pemborosan (Waste & Orphaned Resources)

### A. Unattached Block Volumes (Volume Tersedia Tanpa Compute)
Block Volume yang berstatus `AVAILABLE` dan tidak di-attach ke instance compute tetap membebankan biaya storage per GB-bulan:
```bash
# Ganti COMPARTMENT_OCID sesuai compartment target
oci bv volume list \
  --compartment-id "$TENANCY_OCID" \
  --lifecycle-state AVAILABLE \
  --all \
  --query "data[].{ID:id,Name:\"display-name\",SizeGB:\"size-in-gbs\",VPU:\"vpus-per-gb\",Created:\"time-created\"}" \
  --output table
```

### B. Unassigned Reserved Public IPs
Reserved Public IP yang dialokasikan namun tidak terikat (`assigned-entity-id == null`):
```bash
oci network public-ip list \
  --scope REGION \
  --compartment-id "$TENANCY_OCID" \
  --lifetime RESERVED \
  --all \
  --query "data[?\"assigned-entity-id\"==null].{IP:\"ip-address\",Name:\"display-name\",Created:\"time-created\"}" \
  --output table
```

### C. Stopped Compute Instances
Instance berstatus `STOPPED` menghentikan biaya compute, namun Boot Volume & Block Volume yang menempel tetap ditagihkan biaya storage:
```bash
oci compute instance list \
  --compartment-id "$TENANCY_OCID" \
  --lifecycle-state STOPPED \
  --all \
  --query "data[].{ID:id,Name:\"display-name\",Shape:shape,Created:\"time-created\"}" \
  --output table
```

### D. Boot Volumes Menganggur
Boot volume sisa dari instance yang telah dihapus:
```bash
oci bv boot-volume list \
  --compartment-id "$TENANCY_OCID" \
  --lifecycle-state AVAILABLE \
  --all \
  --query "data[].{ID:id,Name:\"display-name\",SizeGB:\"size-in-gbs\"}" \
  --output table
```

---

## 4. OCI Optimizer (Cloud Advisor Rekomendasi Biaya)

OCI Cloud Advisor / Optimizer mendeteksi instance underutilized dan potensi penghematan:

```bash
# Ambil rekomendasi kategori Cost
oci optimizer recommendation list \
  --compartment-id "$TENANCY_OCID" \
  --category-name cost \
  --all \
  --query "data[].{Name:name,Importance:importance,EstimatedCostSaving:\"estimated-cost-saving\",Status:status}" \
  --output table

# Daftar resource action yang disarankan
oci optimizer resource-action list \
  --compartment-id "$TENANCY_OCID" \
  --all \
  --output table
```

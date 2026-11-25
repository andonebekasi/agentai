#!/usr/bin/env bash
# ==============================================================================
# Multi-Cloud FinOps Audit Script (Cloud Native CLI)
# Mendukung: AWS, GCP, Azure, OCI, Tencent Cloud
# ==============================================================================

set -uo pipefail

# ANSI Colors
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

# Header Banner
print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "======================================================================"
    echo "         Multi-Cloud FinOps Audit Tool (Cloud Native CLI)             "
    echo "        AWS  •  GCP  •  Azure  •  OCI  •  Tencent Cloud               "
    echo "======================================================================"
    echo -e "${RESET}"
}

# ------------------------------------------------------------------------------
# 1. Pengecekan Kesiapan Cloud Native CLI
# ------------------------------------------------------------------------------
check_cli_status() {
    print_banner
    echo -e "${BOLD}Status Instalasi & Autentikasi Cloud Native CLI:${RESET}"
    echo ""

    # AWS
    if command -v aws >/dev/null 2>&1; then
        local aws_ver
        aws_ver=$(aws --version 2>&1 | head -n 1)
        echo -e "  [${GREEN}OK${RESET}] ${BOLD}AWS CLI${RESET}: ${aws_ver}"
        if aws sts get-caller-identity >/dev/null 2>&1; then
            local caller
            caller=$(aws sts get-caller-identity --query "Arn" --output text 2>/dev/null || echo "Active")
            echo -e "       ${GREEN}✓ Autentikasi Aktif:${RESET} ${caller}"
        else
            echo -e "       ${YELLOW}! Belum login/konfigurasi (Jalankan: aws configure)${RESET}"
        fi
    else
        echo -e "  [${RED}MISSING${RESET}] ${BOLD}AWS CLI${RESET} belum terpasang."
        echo -e "       ${CYAN}Pasang:${RESET} curl \"https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip\" -o \"awscliv2.zip\" && unzip awscliv2.zip && sudo ./aws/install"
    fi
    echo ""

    # GCP
    if command -v gcloud >/dev/null 2>&1; then
        local gcloud_ver
        gcloud_ver=$(gcloud --version 2>&1 | head -n 1)
        echo -e "  [${GREEN}OK${RESET}] ${BOLD}Google Cloud CLI (gcloud)${RESET}: ${gcloud_ver}"
        if gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q "@"; then
            local gcp_acc
            gcp_acc=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -n 1)
            echo -e "       ${GREEN}✓ Autentikasi Aktif:${RESET} ${gcp_acc}"
        else
            echo -e "       ${YELLOW}! Belum login/konfigurasi (Jalankan: gcloud auth login)${RESET}"
        fi
    else
        echo -e "  [${RED}MISSING${RESET}] ${BOLD}Google Cloud CLI (gcloud)${RESET} belum terpasang."
        echo -e "       ${CYAN}Pasang:${RESET} curl https://sdk.cloud.google.com | bash"
    fi
    echo ""

    # Azure
    if command -v az >/dev/null 2>&1; then
        local az_ver
        az_ver=$(az version --output json 2>/dev/null | grep '"azure-cli":' | tr -d ' ",' || az --version 2>&1 | head -n 1)
        echo -e "  [${GREEN}OK${RESET}] ${BOLD}Azure CLI (az)${RESET}: ${az_ver}"
        if az account show >/dev/null 2>&1; then
            local az_sub
            az_sub=$(az account show --query "name" --output text 2>/dev/null || echo "Active")
            echo -e "       ${GREEN}✓ Autentikasi Aktif (Subscription):${RESET} ${az_sub}"
        else
            echo -e "       ${YELLOW}! Belum login/konfigurasi (Jalankan: az login)${RESET}"
        fi
    else
        echo -e "  [${RED}MISSING${RESET}] ${BOLD}Azure CLI (az)${RESET} belum terpasang."
        echo -e "       ${CYAN}Pasang:${RESET} curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"
    fi
    echo ""

    # OCI
    if command -v oci >/dev/null 2>&1; then
        local oci_ver
        oci_ver=$(oci --version 2>&1 | head -n 1)
        echo -e "  [${GREEN}OK${RESET}] ${BOLD}OCI CLI (Oracle Cloud)${RESET}: v${oci_ver}"
        if [ -f "$HOME/.oci/config" ] && oci os ns get >/dev/null 2>&1; then
            local oci_ns
            oci_ns=$(oci os ns get --query "data" --output text 2>/dev/null || echo "Active")
            echo -e "       ${GREEN}✓ Autentikasi Aktif (Namespace):${RESET} ${oci_ns}"
        else
            echo -e "       ${YELLOW}! Belum login/konfigurasi (Jalankan: oci setup config)${RESET}"
        fi
    else
        echo -e "  [${RED}MISSING${RESET}] ${BOLD}OCI CLI${RESET} belum terpasang."
        echo -e "       ${CYAN}Pasang:${RESET} bash -c \"\$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)\""
    fi
    echo ""

    # Tencent Cloud
    if command -v tccli >/dev/null 2>&1; then
        local tc_ver
        tc_ver=$(tccli --version 2>&1 | head -n 1)
        echo -e "  [${GREEN}OK${RESET}] ${BOLD}Tencent Cloud CLI (tccli)${RESET}: ${tc_ver}"
        if tccli configure list 2>/dev/null | grep -q "secret"; then
            echo -e "       ${GREEN}✓ Konfigurasi Terdeteksi${RESET}"
        else
            echo -e "       ${YELLOW}! Belum konfigurasi API Secret (Jalankan: tccli configure)${RESET}"
        fi
    else
        echo -e "  [${RED}MISSING${RESET}] ${BOLD}Tencent Cloud CLI (tccli)${RESET} belum terpasang."
        echo -e "       ${CYAN}Pasang:${RESET} pip3 install tccli"
    fi
    echo ""
}

# ------------------------------------------------------------------------------
# 2. Audit AWS FinOps
# ------------------------------------------------------------------------------
audit_aws() {
    echo -e "${CYAN}${BOLD}=== [AWS FinOps Audit] ===${RESET}"
    if ! command -v aws >/dev/null 2>&1; then
        echo -e "${RED}[SKIP] AWS CLI tidak terpasang.${RESET}"
        return
    fi
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        echo -e "${YELLOW}[WARN] AWS CLI belum login/terautentikasi.${RESET}"
        return
    fi

    echo -e "${BLUE}1. Memeriksa Unattached EBS Volumes (Volume Menganggur)...${RESET}"
    local unattached_vols
    unattached_vols=$(aws ec2 describe-volumes --filters Name=status,Values=available --query "Volumes[*].{ID:VolumeId,SizeGB:Size,Type:VolumeType,Created:CreateTime}" --output table 2>/dev/null || true)
    if [ -n "$unattached_vols" ] && echo "$unattached_vols" | grep -q "vol-"; then
        echo -e "${RED}! Ditemukan Unattached EBS Volumes:${RESET}"
        echo "$unattached_vols"
    else
        echo -e "${GREEN}✓ Tidak ada EBS volume yang menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}2. Memeriksa Unassociated Elastic IPs (IP Menganggur berbayar)...${RESET}"
    local unassociated_eips
    unassociated_eips=$(aws ec2 describe-addresses --query "Addresses[?AssociationId==null].{IP:PublicIp,AllocationId:AllocationId}" --output table 2>/dev/null || true)
    if [ -n "$unassociated_eips" ] && echo "$unassociated_eips" | grep -q "eipalloc-"; then
        echo -e "${RED}! Ditemukan Elastic IP tanpa asosiasi (dikenakan biaya):${RESET}"
        echo "$unassociated_eips"
    else
        echo -e "${GREEN}✓ Tidak ada Elastic IP menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}3. Memeriksa Stopped EC2 Instances (Disk tetap bayar)...${RESET}"
    local stopped_ec2
    stopped_ec2=$(aws ec2 describe-instances --filters Name=instance-state-name,Values=stopped --query "Reservations[*].Instances[*].{ID:InstanceId,Type:InstanceType,LaunchTime:LaunchTime}" --output table 2>/dev/null || true)
    if [ -n "$stopped_ec2" ] && echo "$stopped_ec2" | grep -q "i-"; then
        echo -e "${YELLOW}! Ditemukan EC2 Instance berstatus Stopped:${RESET}"
        echo "$stopped_ec2"
    else
        echo -e "${GREEN}✓ Tidak ada EC2 instance stopped.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}4. Memeriksa Biaya Berjalan Bulan Ini (AWS Cost Explorer)...${RESET}"
    local start_date end_date
    start_date=$(date -d "$(date +%Y-%m-01)" +%Y-%m-%d 2>/dev/null || date +%Y-%m-01)
    end_date=$(date +%Y-%m-%d)
    local cost_summary
    cost_summary=$(aws ce get-cost-and-usage --time-period "Start=${start_date},End=${end_date}" --granularity MONTHLY --metrics "UnblendedCost" --query "ResultsByTime[0].Total.UnblendedCost" --output table 2>/dev/null || true)
    if [ -n "$cost_summary" ] && echo "$cost_summary" | grep -q "Amount"; then
        echo -e "${GREEN}Biaya MTD AWS:${RESET}"
        echo "$cost_summary"
    else
        echo -e "${YELLOW}(Perizinan ce:GetCostAndUsage tidak aktif atau belum di-enable di IAM)${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 3. Audit GCP FinOps
# ------------------------------------------------------------------------------
audit_gcp() {
    echo -e "${CYAN}${BOLD}=== [GCP FinOps Audit] ===${RESET}"
    if ! command -v gcloud >/dev/null 2>&1; then
        echo -e "${RED}[SKIP] Google Cloud CLI (gcloud) tidak terpasang.${RESET}"
        return
    fi

    echo -e "${BLUE}1. Memeriksa Unattached Persistent Disks (Disk Tanpa VM)...${RESET}"
    local unattached_disks
    unattached_disks=$(gcloud compute disks list --filter="-users:*" --format="table(name,sizeGb,type.basename(),zone.basename(),status)" 2>/dev/null || true)
    if [ -n "$unattached_disks" ] && [ "$(echo "$unattached_disks" | wc -l)" -gt 1 ]; then
        echo -e "${RED}! Ditemukan Unattached Persistent Disks:${RESET}"
        echo "$unattached_disks"
    else
        echo -e "${GREEN}✓ Tidak ada Persistent Disk yang menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}2. Memeriksa Unused Reserved External IPs...${RESET}"
    local unused_ips
    unused_ips=$(gcloud compute addresses list --filter="status=RESERVED" --format="table(name,address,region.basename(),status)" 2>/dev/null || true)
    if [ -n "$unused_ips" ] && [ "$(echo "$unused_ips" | wc -l)" -gt 1 ]; then
        echo -e "${RED}! Ditemukan Reserved IP Address tidak terpakai:${RESET}"
        echo "$unused_ips"
    else
        echo -e "${GREEN}✓ Tidak ada Reserved External IP menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}3. Memeriksa Terminated VM Instances...${RESET}"
    local stopped_vms
    stopped_vms=$(gcloud compute instances list --filter="status=TERMINATED" --format="table(name,zone.basename(),machineType.basename())" 2>/dev/null || true)
    if [ -n "$stopped_vms" ] && [ "$(echo "$stopped_vms" | wc -l)" -gt 1 ]; then
        echo -e "${YELLOW}! Ditemukan VM berstatus TERMINATED:${RESET}"
        echo "$stopped_vms"
    else
        echo -e "${GREEN}✓ Tidak ada terminated instance.${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 4. Audit Azure FinOps
# ------------------------------------------------------------------------------
audit_azure() {
    echo -e "${CYAN}${BOLD}=== [Azure FinOps Audit] ===${RESET}"
    if ! command -v az >/dev/null 2>&1; then
        echo -e "${RED}[SKIP] Azure CLI (az) tidak terpasang.${RESET}"
        return
    fi
    if ! az account show >/dev/null 2>&1; then
        echo -e "${YELLOW}[WARN] Azure CLI belum login (Jalankan: az login).${RESET}"
        return
    fi

    echo -e "${BLUE}1. Memeriksa Unattached Managed Disks...${RESET}"
    local unattached_disks
    unattached_disks=$(az disk list --query "[?managedBy==null].{Name:name,SizeGB:diskSizeGb,Sku:sku.name,ResourceGroup:resourceGroup}" --output table 2>/dev/null || true)
    if [ -n "$unattached_disks" ] && echo "$unattached_disks" | grep -v "Name" | grep -q "[a-zA-Z0-9]"; then
        echo -e "${RED}! Ditemukan Unattached Managed Disks:${RESET}"
        echo "$unattached_disks"
    else
        echo -e "${GREEN}✓ Tidak ada Azure Managed Disk menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}2. Memeriksa Unassociated Public IPs...${RESET}"
    local unassociated_ips
    unassociated_ips=$(az network public-ip list --query "[?ipConfiguration==null].{Name:name,IP:ipAddress,ResourceGroup:resourceGroup}" --output table 2>/dev/null || true)
    if [ -n "$unassociated_ips" ] && echo "$unassociated_ips" | grep -v "Name" | grep -q "[a-zA-Z0-9]"; then
        echo -e "${RED}! Ditemukan Public IP tanpa konfigurasi NIC:${RESET}"
        echo "$unassociated_ips"
    else
        echo -e "${GREEN}✓ Tidak ada Public IP menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}3. Memeriksa Azure Advisor Cost Recommendations...${RESET}"
    local advisor_recs
    advisor_recs=$(az advisor recommendation list --category Cost --query "[].{Impact:impact,Problem:shortDescription.problem}" --output table 2>/dev/null || true)
    if [ -n "$advisor_recs" ] && echo "$advisor_recs" | grep -v "Impact" | grep -q "[a-zA-Z0-9]"; then
        echo -e "${YELLOW}! Ditemukan Rekomendasi Penghematan Azure Advisor:${RESET}"
        echo "$advisor_recs"
    else
        echo -e "${GREEN}✓ Tidak ada rekomendasi cost dari Azure Advisor.${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 5. Audit OCI FinOps
# ------------------------------------------------------------------------------
audit_oci() {
    echo -e "${CYAN}${BOLD}=== [OCI FinOps Audit] ===${RESET}"
    if ! command -v oci >/dev/null 2>&1; then
        echo -e "${RED}[SKIP] OCI CLI tidak terpasang.${RESET}"
        return
    fi
    if [ ! -f "$HOME/.oci/config" ]; then
        echo -e "${YELLOW}[WARN] Konfigurasi ~/.oci/config tidak ditemukan.${RESET}"
        return
    fi

    local tenancy_ocid
    tenancy_ocid=$(grep tenancy "$HOME/.oci/config" | cut -d= -f2 | tr -d ' ' | head -n 1)
    if [ -z "$tenancy_ocid" ]; then
        echo -e "${YELLOW}[WARN] Tenancy OCID tidak ditemukan di ~/.oci/config.${RESET}"
        return
    fi

    echo -e "${BLUE}1. Memeriksa Unattached Block Volumes di Tenancy...${RESET}"
    local unattached_bv
    unattached_bv=$(oci bv volume list --compartment-id "$tenancy_ocid" --lifecycle-state AVAILABLE --all --query "data[].{ID:id,Name:\"display-name\",SizeGB:\"size-in-gbs\"}" --output table 2>/dev/null || true)
    if [ -n "$unattached_bv" ] && echo "$unattached_bv" | grep -q "ocid1.volume."; then
        echo -e "${RED}! Ditemukan Unattached Block Volumes:${RESET}"
        echo "$unattached_bv"
    else
        echo -e "${GREEN}✓ Tidak ada Block Volume menganggur di root compartment.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}2. Memeriksa Unassigned Reserved Public IPs...${RESET}"
    local unassigned_ips
    unassigned_ips=$(oci network public-ip list --scope REGION --compartment-id "$tenancy_ocid" --lifetime RESERVED --all --query "data[?\"assigned-entity-id\"==null].{IP:\"ip-address\",Name:\"display-name\"}" --output table 2>/dev/null || true)
    if [ -n "$unassigned_ips" ] && echo "$unassigned_ips" | grep -q "ip-address"; then
        echo -e "${RED}! Ditemukan Reserved Public IP menganggur:${RESET}"
        echo "$unassigned_ips"
    else
        echo -e "${GREEN}✓ Tidak ada Reserved Public IP menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}3. Memeriksa OCI Optimizer Cost Recommendations...${RESET}"
    local opt_recs
    opt_recs=$(oci optimizer recommendation list --compartment-id "$tenancy_ocid" --category-name cost --all --query "data[].{Name:name,Importance:importance,EstimatedCostSaving:\"estimated-cost-saving\"}" --output table 2>/dev/null || true)
    if [ -n "$opt_recs" ] && echo "$opt_recs" | grep -q "name"; then
        echo -e "${YELLOW}! Ditemukan Rekomendasi Biaya OCI Optimizer:${RESET}"
        echo "$opt_recs"
    else
        echo -e "${GREEN}✓ Tidak ada rekomendasi pending dari OCI Optimizer.${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 6. Audit Tencent Cloud FinOps
# ------------------------------------------------------------------------------
audit_tencent() {
    echo -e "${CYAN}${BOLD}=== [Tencent Cloud FinOps Audit] ===${RESET}"
    if ! command -v tccli >/dev/null 2>&1; then
        echo -e "${RED}[SKIP] Tencent Cloud CLI (tccli) tidak terpasang.${RESET}"
        return
    fi

    echo -e "${BLUE}1. Memeriksa Unattached CBS Disks...${RESET}"
    local unattached_cbs
    unattached_cbs=$(tccli cbs DescribeDisks --Filters '[{"Name":"disk-state","Values":["UNATTACHED"]}]' 2>/dev/null || true)
    if [ -n "$unattached_cbs" ] && echo "$unattached_cbs" | grep -q "DiskId"; then
        echo -e "${RED}! Ditemukan Unattached CBS Disks:${RESET}"
        echo "$unattached_cbs"
    else
        echo -e "${GREEN}✓ Tidak ada CBS disk menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}2. Memeriksa Unbind Elastic IPs (EIP Menganggur)...${RESET}"
    local unbind_eips
    unbind_eips=$(tccli vpc DescribeAddresses --Filters '[{"Name":"address-status","Values":["UNBIND"]}]' 2>/dev/null || true)
    if [ -n "$unbind_eips" ] && echo "$unbind_eips" | grep -q "AddressId"; then
        echo -e "${RED}! Ditemukan Unbind Elastic IP:${RESET}"
        echo "$unbind_eips"
    else
        echo -e "${GREEN}✓ Tidak ada Elastic IP menganggur.${RESET}"
    fi

    echo ""
    echo -e "${BLUE}3. Memeriksa Stopped CVM Instances...${RESET}"
    local stopped_cvm
    stopped_cvm=$(tccli cvm DescribeInstances --Filters '[{"Name":"instance-state","Values":["STOPPED"]}]' 2>/dev/null || true)
    if [ -n "$stopped_cvm" ] && echo "$stopped_cvm" | grep -q "InstanceId"; then
        echo -e "${YELLOW}! Ditemukan CVM berstatus STOPPED:${RESET}"
        echo "$stopped_cvm"
    else
        echo -e "${GREEN}✓ Tidak ada CVM instance stopped.${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 7. Menu & Argument Router
# ------------------------------------------------------------------------------
case "${1:-check}" in
    check|status)
        check_cli_status
        ;;
    aws)
        audit_aws
        ;;
    gcp)
        audit_gcp
        ;;
    azure|az)
        audit_azure
        ;;
    oci)
        audit_oci
        ;;
    tencent|tc)
        audit_tencent
        ;;
    all)
        print_banner
        audit_aws
        echo ""
        audit_gcp
        echo ""
        audit_azure
        echo ""
        audit_oci
        echo ""
        audit_tencent
        echo ""
        echo -e "${GREEN}${BOLD}✓ Audit FinOps Multi-Cloud Selesai!${RESET}"
        ;;
    -h|--help|help)
        echo "Penggunaan: ./finops_audit.sh [subcommand]"
        echo ""
        echo "Subcommand:"
        echo "  check         Periksa instalasi dan status autentikasi 5 Cloud CLI (default)"
        echo "  all           Jalankan audit FinOps menyeluruh di seluruh cloud yang aktif"
        echo "  aws           Audit FinOps khusus AWS (EBS, EIP, Stopped EC2, Cost Explorer)"
        echo "  gcp           Audit FinOps khusus GCP (Disks, Static IPs, Stopped VMs)"
        echo "  azure         Audit FinOps khusus Azure (Managed Disks, Public IPs, Advisor)"
        echo "  oci           Audit FinOps khusus OCI (Block Volumes, Reserved IPs, Optimizer)"
        echo "  tencent       Audit FinOps khusus Tencent Cloud (CBS Disks, Unbind EIP, CVM)"
        echo "  help, -h      Tampilkan bantuan ini"
        ;;
    *)
        echo -e "${RED}[ERROR] Subcommand tidak dikenal: $1${RESET}"
        echo "Gunakan: ./finops_audit.sh --help"
        exit 1
        ;;
esac

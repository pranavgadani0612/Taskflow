import React, { useEffect, useState } from "react";
import DataTable from "../components/common/DataTable";
import PageHeader from "../components/common/PageHeader";
import FormModal from "../components/common/FormModal";
import { TextInput, SelectField } from "../components/common/FormFields";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

export default function CompanyList() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    companyName: "",
    gstNumber: "",
    panNumber: "",
    contactPersonName: "",
    contactPersonPhone: "",
    contactPersonEmail: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    country: "India",
    state: "",
    city: "",
    pincode: "",
    status: "Active"
  });

  const [fieldErrors, setFieldErrors] = useState({});

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const res = await API.get("/companies");
      setCompanies(res.data);
    } catch (err) {
      showToast("Error loading companies", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadCompanies();
    }
  }, [isSuperAdmin]);

  const edit = (company) => {
    setForm({ ...company });
    setFieldErrors({});
    setEditId(company._id);
    setShowForm(true);
  };

  const save = async () => {
    const errs = {};
    if (!form.companyName?.trim()) errs.companyName = "Plese enter company name";
    if (!form.email?.trim()) errs.email = "Plese enter email";
    if (!form.contactPersonName?.trim()) errs.contactPersonName = "Plese enter contact person name";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    // --- FRONTEND VALIDATION ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (!emailRegex.test(form.email)) return showToast("Valid email is required", "error");
    if (form.phone && !phoneRegex.test(form.phone)) return showToast("Phone must be 10 digits", "error");
    
    if (form.gstNumber && !gstRegex.test(form.gstNumber.toUpperCase())) return showToast("Invalid GST format", "error");
    if (form.panNumber && !panRegex.test(form.panNumber.toUpperCase())) return showToast("Invalid PAN format", "error");

    try {
      setFieldErrors({});
      const sanitizedForm = { ...form };
      if (sanitizedForm.gstNumber) sanitizedForm.gstNumber = sanitizedForm.gstNumber.toUpperCase();
      if (sanitizedForm.panNumber) sanitizedForm.panNumber = sanitizedForm.panNumber.toUpperCase();

      if (editId) {
        await API.put(`/companies/${editId}`, sanitizedForm);
        showToast("Company updated successfully");
      } else {
        await API.post("/companies", sanitizedForm);
        showToast("Company added successfully");
      }
      setShowForm(false);
      setEditId(null);
      loadCompanies();
    } catch (err) {
      showToast(err.response?.data?.error || "Error saving company", "error");
    }
  };

  const removeCompany = async (id) => {
    try {
      await API.delete(`/companies/${id}`);
      showToast("Company deleted successfully");
      loadCompanies();
    } catch (err) {
      showToast("Error deleting company", "error");
    }
  };

  const columns = [
    { 
      header: "Logo", 
      key: "appLogo",
      render: (v) => v ? (
        <img src={`http://localhost:5000${v}`} alt="Logo" style={{ width: "40px", height: "40px", objectFit: "contain" }} />
      ) : <div style={{ width: "40px", height: "40px", background: "#f1f5f9", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#64748b" }}>No Logo</div>
    },
    { header: "Company Name", key: "companyName" },
    { header: "Contact Person", key: "contactPersonName" },
    { header: "Email", key: "email" },
    { header: "City", key: "city" },
    { 
      header: "Status", 
      key: "status",
      render: (v) => (
        <span className={`badge badge-${v?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
          {v || "Active"}
        </span>
      )
    },
  ];

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    // Length & Type Restrictions
    if (name.toLowerCase().includes("phone") || name === "pincode") {
      const onlyNums = value.replace(/[^0-9]/g, "");
      const maxLen = name === "pincode" ? 6 : 10;
      if (onlyNums.length <= maxLen) {
        setForm({ ...form, [name]: onlyNums });
      }
      return;
    }
    if (name === "gstNumber" && value.length > 15) return;
    if (name === "panNumber" && value.length > 10) return;

    setForm({ ...form, [name]: value });
  };

  if (!isSuperAdmin) {
    return <div className="page" style={{ padding: "40px", textAlign: "center" }}>Access Denied. Only Super Admins can view this page.</div>;
  }

  return (
    <div className="page">
      <PageHeader
        title="Company Management"
        buttonText={null}
      />
      
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }}>Loading companies...</div>
      ) : (
        <DataTable
          data={companies}
          columns={columns}
          onEdit={edit}
          onDelete={removeCompany}
        />
      )}

      <FormModal
        show={showForm}
        onClose={() => setShowForm(false)}
        title="Edit Company"
        onSave={save}
        saveText="Update"
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <TextInput 
              label="Company Name *" 
              name="companyName" 
              value={form.companyName} 
              onChange={(e) => {
                handleFormChange(e);
                if (fieldErrors.companyName) setFieldErrors(prev => ({ ...prev, companyName: null }));
              }} 
              error={fieldErrors.companyName}
            />
          </div>
          <div>
            <TextInput 
              label="Contact Person *" 
              name="contactPersonName" 
              value={form.contactPersonName} 
              onChange={(e) => {
                handleFormChange(e);
                if (fieldErrors.contactPersonName) setFieldErrors(prev => ({ ...prev, contactPersonName: null }));
              }} 
              error={fieldErrors.contactPersonName}
            />
          </div>
          <div>
            <TextInput 
              label="Email *" 
              name="email" 
              value={form.email} 
              onChange={(e) => {
                handleFormChange(e);
                if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: null }));
              }} 
              error={fieldErrors.email}
            />
          </div>
          <TextInput label="Phone" name="phone" value={form.phone} onChange={handleFormChange} maxLength={10} />
          <TextInput label="GST Number" name="gstNumber" value={form.gstNumber} onChange={handleFormChange} maxLength={15} />
          <TextInput label="PAN Number" name="panNumber" value={form.panNumber} onChange={handleFormChange} maxLength={10} />
          <TextInput label="City" name="city" value={form.city} onChange={handleFormChange} />
          <SelectField 
            label="Status" 
            name="status"
            value={form.status} 
            onChange={handleFormChange}
            options={[
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" }
            ]}
          />
        </div>
      </FormModal>
    </div>
  );
}


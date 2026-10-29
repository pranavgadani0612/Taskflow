import React, { useEffect, useState } from "react";
import API from "../api/api";
import { useProject } from "../contexts/ProjectContext";
import { useCompany } from "../contexts/CompanyContext";
import "../style/main.css";

export default function Team() {
    const { selectedProject } = useProject();
    const { selectedCompany } = useCompany();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const fetchTeam = async () => {
            setLoading(true);
            try {
                const res = await API.get("/staff");
                const allStaff = res.data.staff || res.data || [];
                
                if (selectedProject) {
                    let projectData = selectedProject;
                    const projId = selectedProject._id || selectedProject.id;
                    if (projId) {
                        try {
                            const pRes = await API.get(`/projects/${projId}`);
                            if (pRes.data) projectData = pRes.data;
                        } catch (err) {
                            console.warn("Could not reload single project:", err);
                        }
                    }

                    const assignedList = projectData.assignedTo || projectData.assigned_to || [];
                    if (assignedList.length > 0) {
                        const assignedIds = assignedList.map(u => String(u._id || u.id || u));
                        const assignedEmails = assignedList.map(u => (u.email || "").toLowerCase()).filter(Boolean);
                        const filtered = allStaff.filter(s => {
                            const sId = String(s._id || s.id || "");
                            const sEmail = (s.email || "").toLowerCase();
                            return (sId && assignedIds.includes(sId)) || (sEmail && assignedEmails.includes(sEmail));
                        });
                        setMembers(filtered.length > 0 ? filtered : assignedList);
                    } else {
                        // If no specific assigned staff found, show all organization staff assigned to this company
                        setMembers(allStaff);
                    }
                } else {
                    setMembers(allStaff);
                }
            } catch (e) {
                console.error(e);
                setMembers([]);
            }
            setLoading(false);
        };

        fetchTeam();
    }, [selectedProject, selectedCompany]);

    const getInitials = (name = "") =>
        name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    const trimmedSearch = search.trim().toLowerCase();
    const filteredMembers = members.filter(m => {
        if (!trimmedSearch || trimmedSearch.length < 3) return true;
        return (
            m.name?.toLowerCase().includes(trimmedSearch) ||
            m.email?.toLowerCase().includes(trimmedSearch)
        );
    });

    return (
        <div className="page">
            {/* Header section with Search */}
            <div className="header">
                <div>
                    <h2>Team Members</h2>
                    <p style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: "600", marginTop: "4px" }}>
                        {selectedProject ? `PROJECT TEAM / ${selectedProject.name}` : "DIRECT ORGANIZATION STAFF"}
                    </p>
                </div>
                <div className="search-wrapper">
                    <span className="search-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
                    </span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search members..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                    {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />)}
                </div>
            ) : filteredMembers.length === 0 ? (
                <div className="table-container" style={{ padding: '60px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-light)', marginBottom: '16px' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    </div>
                    <h3 style={{ color: 'var(--text-main)', fontWeight: '700' }}>No members found</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Try adjusting your search or filters</p>
                </div>
            ) : (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "24px",
                }}>
                    {filteredMembers.map(member => (
                        <div
                            key={member._id || member.id}
                            style={{
                                background: "var(--ui-surface)",
                                borderRadius: "12px",
                                padding: "24px",
                                border: "1px solid var(--ui-border)",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                transition: "all 0.2s ease-in-out",
                                position: 'relative'
                            }}
                            className="team-card"
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = "translateY(-4px)";
                                e.currentTarget.style.boxShadow = "var(--shadow-md)";
                                e.currentTarget.style.borderColor = "var(--primary-color)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.borderColor = "var(--ui-border)";
                            }}
                        >
                            {/* Role Badge */}
                            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                <span className={`badge badge-active`} style={{ 
                                    fontSize: '9px', 
                                    padding: '2px 6px',
                                    background: member.email === "gadanipranav@gmail.com" ? '#fce7f3' : 'var(--primary-light)',
                                    color: member.email === "gadanipranav@gmail.com" ? '#be185d' : 'var(--primary-color)'
                                }}>
                                    {member.role?.name || member.role || "Member"}
                                </span>
                            </div>

                            {/* Avatar */}
                            <div style={{ 
                                width: "64px", height: "64px", 
                                borderRadius: "50%", 
                                background: "var(--primary-color)", 
                                color: "#fff", 
                                display: "flex", alignItems: "center", justifyContent: "center", 
                                fontSize: "20px", fontWeight: "700",
                                marginBottom: "16px",
                                border: "3px solid #fff",
                                boxShadow: "0 0 0 1px var(--ui-border)"
                            }}>
                                {getInitials(member.name)}
                            </div>

                            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
                                {member.name}
                            </h3>
                            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                                {member.email}
                            </p>

                            {/* Info Rows */}
                            <div style={{ width: '100%', borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: '600', textTransform: 'uppercase' }}>Department</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: '500' }}>{member.department || "Engineering"}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: '600', textTransform: 'uppercase' }}>Phone</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: '500' }}>{member.phone || "—"}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: '600', textTransform: 'uppercase' }}>Status</span>
                                    <span className={`badge badge-${member.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
                                        {member.status || "Active"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

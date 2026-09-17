// Administration workspace copy. Split out per domain, matching
// intake-messages / clinical-messages / operations-messages.
export const administrationMessages = {
  // --- shell ---------------------------------------------------------------
  adminLoading: "Loading administration…",
  adminLoadFailed: "Unable to load administration.",
  adminSaved: "Changes saved.",
  adminSaveFailed: "Unable to save. Check your permissions and entries.",
  adminConnectFailed: "Unable to connect.",
  adminSaving: "Saving…",
  adminSaveChanges: "Save changes",
  adminCancel: "Cancel",

  // --- save failures, keyed by API error code -------------------------------
  adminErr_recordChanged: "This record changed. Refresh and try again.",
  adminErr_lastAdministrator: "The last active administrator cannot be removed.",
  adminErr_selfAccessChange: "You cannot change your own access.",
  adminErr_reauthFailed: "Your current password was not accepted.",
  adminErr_emailExists: "That email address is already in use.",
  adminErr_rosterAssignmentRequired: "Assign the doctor to this clinic on their staff profile first.",
  adminErr_facilityHasVisits: "Complete the open visits before deactivating this facility.",
  adminErr_validationFailed: "Check the required fields and try again.",
  adminErr_accessDenied: "Your role cannot make this change.",

  // --- tabs ----------------------------------------------------------------
  adminTabStaff: "Staff and access",
  adminTabHospital: "Hospital settings",
  adminTabFacilities: "Clinics and facilities",

  // --- staff table ---------------------------------------------------------
  adminStaffTitle: "Staff and user accounts",
  adminStaffNote: "Hospital administrators manage staff and facility assignments. Security administrators manage roles, account status, and password resets.",
  adminCreateUser: "Create user",
  adminColStaff: "Staff",
  adminColRoles: "Roles",
  adminColFacilities: "Facilities",
  adminColStatus: "Status",
  adminColActions: "Actions",
  adminColName: "Name",
  adminColType: "Type",
  adminNone: "None",
  adminPasswordChangeRequired: "Password change required",
  adminEditStaff: "Edit staff",
  adminManageAccess: "Manage access",

  // --- staff form ----------------------------------------------------------
  adminFullName: "Full name",
  adminEmail: "Email",
  adminDesignation: "Designation",
  adminLicence: "Licence number",
  adminLicenceExpiry: "Licence expiry",
  adminFacilityAssignments: "Facility assignments",
  adminRoles: "Roles",
  adminTemporaryPassword: "Temporary password (at least 12 characters)",
  adminCurrentPassword: "Your current password to confirm",
  adminStaffSaveNote: "Saving staff changes signs this user out. New users must change their temporary password at first sign-in.",

  // --- access form ---------------------------------------------------------
  adminAccessTitle: "Access",
  adminAccountStatus: "Account status",
  adminResetPassword: "Reset password (optional; at least 12 characters)",
  adminAccessReason: "Reason for access change",
  adminAccessSaveNote: "Saving revokes all sessions for this user.",

  // --- hospital settings ---------------------------------------------------
  adminHospitalTitle: "Hospital configuration",
  adminHospitalName: "Hospital name",
  adminMrnPrefix: "Prefix for new MRNs",
  adminAddress: "Address",
  adminPhone: "Phone",
  adminClinicalIdle: "Clinical session idle minutes",
  adminAdminIdle: "Administration idle minutes",
  adminDilationMinutes: "Dilation waiting minutes",
  adminHospitalNote: "Session duration changes apply at the next sign-in. Existing MRNs remain unchanged.",
  adminSaveHospital: "Save hospital settings",

  // --- facilities ----------------------------------------------------------
  adminAddFacility: "Add facility",
  adminEditFacility: "Edit facility",
  adminNewFacility: "New facility",
  adminFacilityName: "Facility name",
  adminType: "Type",
  adminOpeningTime: "Opening time",
  adminClosingTime: "Closing time",
  adminSlotMinutes: "Appointment length (minutes)",
  adminOpeningDays: "Clinic opening days",
  adminClosedDates: "Closed dates (YYYY-MM-DD, comma separated)",
  adminDoctorRoster: "Doctor roster",
  adminRosterNote: "Assign a doctor to this facility on their staff profile before adding them to its roster.",

  // --- enumerations --------------------------------------------------------
  accountStatus_active: "Active",
  accountStatus_disabled: "Disabled",
  facilityState_active: "Active",
  facilityState_inactive: "Inactive",
  facilityType_clinic: "Clinic",
  facilityType_theatre: "Theatre",
  facilityType_pharmacy: "Pharmacy",
  weekday_0: "Sunday",
  weekday_1: "Monday",
  weekday_2: "Tuesday",
  weekday_3: "Wednesday",
  weekday_4: "Thursday",
  weekday_5: "Friday",
  weekday_6: "Saturday",
} as const;

use anchor_lang::prelude::*;

declare_id!("7pN4CMWDkZEg5CVJmuEFnV28GfN3413FAfRqo4CzL6p2");

// Constants

pub const MAX_PROTOCOL_FEE_BPS: u16 = 500; // 5 % hard cap
pub const MAX_ROYALTY_BPS: u16 = 1_000; // 10 % hard cap
pub const MAX_AUDITOR_QUORUM: u8 = 9;
pub const MAX_SUPPORTED_KINDS: usize = 16;
pub const MAX_REGIONS: usize = 8;
pub const MAX_REGION_LEN: usize = 32;
pub const MAX_RESULT_URIS: usize = 8;
pub const MAX_RESULT_URI_BYTES: usize = 512;
pub const DIGEST_LEN: usize = 32; // SHA-256 bytes
pub const NONCE_LEN: usize = 32;

// Program

#[program]
pub mod clawd_core {
    use super::*;

    // Protocol administration

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        authority: Pubkey,
        upgrade_authority: Pubkey,
        emergency_pause_authority: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        require!(fee_bps <= MAX_PROTOCOL_FEE_BPS, ClaError::FeeTooHigh);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = authority;
        cfg.upgrade_authority = upgrade_authority;
        cfg.emergency_pause_authority = emergency_pause_authority;
        cfg.fee_bps = fee_bps;
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        emit!(ProtocolInitialized { authority, fee_bps });
        Ok(())
    }

    pub fn update_protocol_config(
        ctx: Context<AdminConfig>,
        new_fee_bps: Option<u16>,
        new_authority: Option<Pubkey>,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        if let Some(bps) = new_fee_bps {
            require!(bps <= MAX_PROTOCOL_FEE_BPS, ClaError::FeeTooHigh);
            cfg.fee_bps = bps;
        }
        if let Some(auth) = new_authority {
            cfg.authority = auth;
        }
        Ok(())
    }

    pub fn pause_protocol(ctx: Context<PauseOnly>) -> Result<()> {
        ctx.accounts.config.paused = true;
        emit!(ProtocolPaused {});
        Ok(())
    }

    pub fn resume_protocol(ctx: Context<AdminConfig>) -> Result<()> {
        ctx.accounts.config.paused = false;
        emit!(ProtocolResumed {});
        Ok(())
    }

    // Provider registration

    pub fn register_provider(
        ctx: Context<RegisterProvider>,
        display_name: String,
        endpoint_url: String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, ClaError::ProtocolPaused);
        require!(display_name.len() <= 64, ClaError::StringTooLong);
        require!(endpoint_url.len() <= 128, ClaError::StringTooLong);
        let provider = &mut ctx.accounts.provider;
        provider.wallet = ctx.accounts.wallet.key();
        provider.display_name = display_name;
        provider.endpoint_url = endpoint_url;
        provider.active = true;
        provider.jobs_completed = 0;
        provider.jobs_failed = 0;
        provider.reputation_score = 100;
        provider.bump = ctx.bumps.provider;
        emit!(ProviderRegistered {
            wallet: provider.wallet,
        });
        Ok(())
    }

    pub fn update_provider(
        ctx: Context<ProviderSigner>,
        display_name: Option<String>,
        endpoint_url: Option<String>,
        active: Option<bool>,
    ) -> Result<()> {
        let provider = &mut ctx.accounts.provider;
        if let Some(name) = display_name {
            require!(name.len() <= 64, ClaError::StringTooLong);
            provider.display_name = name;
        }
        if let Some(url) = endpoint_url {
            require!(url.len() <= 128, ClaError::StringTooLong);
            provider.endpoint_url = url;
        }
        if let Some(a) = active {
            provider.active = a;
        }
        Ok(())
    }

    // Capability management

    pub fn publish_capability(
        ctx: Context<PublishCapability>,
        cap_digest: [u8; DIGEST_LEN],
        gpu_count: u8,
        gpu_memory_gib: u16,
        cpu_cores: u16,
        memory_gib: u16,
        disk_gib: u32,
        supported_kinds: Vec<u8>,
        regions: Vec<String>,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, ClaError::ProtocolPaused);
        require!(
            supported_kinds.len() <= MAX_SUPPORTED_KINDS,
            ClaError::TooManyItems
        );
        require!(regions.len() <= MAX_REGIONS, ClaError::TooManyItems);
        for region in &regions {
            require!(region.len() <= MAX_REGION_LEN, ClaError::StringTooLong);
        }
        let cap = &mut ctx.accounts.capability;
        cap.provider = ctx.accounts.provider.key();
        cap.cap_digest = cap_digest;
        cap.gpu_count = gpu_count;
        cap.gpu_memory_gib = gpu_memory_gib;
        cap.cpu_cores = cpu_cores;
        cap.memory_gib = memory_gib;
        cap.disk_gib = disk_gib;
        cap.supported_kinds = supported_kinds;
        cap.regions = regions;
        cap.active = true;
        cap.bump = ctx.bumps.capability;
        emit!(CapabilityPublished {
            provider: cap.provider,
            cap_digest,
        });
        Ok(())
    }

    pub fn retire_capability(ctx: Context<ProviderCapabilitySigner>) -> Result<()> {
        ctx.accounts.capability.active = false;
        Ok(())
    }

    // Job lifecycle

    pub fn create_job(
        ctx: Context<CreateJob>,
        nonce: u64,
        manifest_digest: [u8; DIGEST_LEN],
        kind: JobKind,
        provider_budget_lamports: u64,
        auditor_budget_lamports: u64,
        royalty_budget_lamports: u64,
        bid_end_unix: i64,
        accept_by_unix: i64,
        result_by_unix: i64,
        auditor_quorum: u8,
        challenge_window_seconds: u32,
        assurance_profile: u8,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, ClaError::ProtocolPaused);
        require!(
            auditor_quorum > 0 && auditor_quorum <= MAX_AUDITOR_QUORUM,
            ClaError::InvalidQuorum
        );
        require!(assurance_profile <= 4, ClaError::InvalidProfile);
        let clock = Clock::get()?;
        require!(bid_end_unix > clock.unix_timestamp, ClaError::DeadlinePast);
        require!(accept_by_unix > bid_end_unix, ClaError::DeadlineOrder);
        require!(result_by_unix > accept_by_unix, ClaError::DeadlineOrder);

        let job = &mut ctx.accounts.job;
        job.creator = ctx.accounts.creator.key();
        job.nonce = nonce;
        job.manifest_digest = manifest_digest;
        job.kind = kind;
        job.state = JobState::Draft;
        job.provider_budget = provider_budget_lamports;
        job.auditor_budget = auditor_budget_lamports;
        job.royalty_budget = royalty_budget_lamports;
        job.bid_end_unix = bid_end_unix;
        job.accept_by_unix = accept_by_unix;
        job.result_by_unix = result_by_unix;
        job.auditor_quorum = auditor_quorum;
        job.challenge_window_seconds = challenge_window_seconds;
        job.assurance_profile = assurance_profile;
        job.assigned_provider = None;
        job.created_at = clock.unix_timestamp;
        job.bump = ctx.bumps.job;

        emit!(JobCreated {
            job: job.key(),
            creator: job.creator,
            kind: job.kind.clone(),
            manifest_digest,
        });
        Ok(())
    }

    pub fn fund_job(ctx: Context<FundJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::Draft, ClaError::InvalidJobState);

        let total = job
            .provider_budget
            .checked_add(job.auditor_budget)
            .and_then(|v| v.checked_add(job.royalty_budget))
            .ok_or(ClaError::Overflow)?;

        // Transfer total to escrow PDA
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            total,
        )?;

        job.state = JobState::Open;
        emit!(JobFunded {
            job: job.key(),
            total_lamports: total,
        });
        Ok(())
    }

    pub fn open_job(ctx: Context<JobCreatorOnly>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::Draft, ClaError::InvalidJobState);
        job.state = JobState::Open;
        Ok(())
    }

    pub fn cancel_job(ctx: Context<JobCreatorOnly>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(
            job.state == JobState::Draft || job.state == JobState::Open,
            ClaError::InvalidJobState
        );
        job.state = JobState::Cancelled;
        emit!(JobCancelled { job: job.key() });
        Ok(())
    }

    pub fn expire_job(ctx: Context<ExpireJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::Open, ClaError::InvalidJobState);
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp > job.accept_by_unix,
            ClaError::DeadlineNotPast
        );
        job.state = JobState::Expired;
        emit!(JobExpired { job: job.key() });
        Ok(())
    }

    // Bidding

    pub fn submit_bid(
        ctx: Context<SubmitBid>,
        price_lamports: u64,
        estimated_start_unix: i64,
        estimated_finish_unix: i64,
        bid_expiry_unix: i64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, ClaError::ProtocolPaused);
        let job = &ctx.accounts.job;
        require!(job.state == JobState::Open, ClaError::InvalidJobState);
        require!(ctx.accounts.provider.active, ClaError::ProviderInactive);
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < job.bid_end_unix,
            ClaError::BiddingClosed
        );
        require!(price_lamports <= job.provider_budget, ClaError::BidTooHigh);
        require!(
            estimated_finish_unix <= job.result_by_unix,
            ClaError::DeadlineMismatch
        );

        let bid = &mut ctx.accounts.bid;
        bid.job = job.key();
        bid.provider = ctx.accounts.provider.wallet;
        bid.price_lamports = price_lamports;
        bid.estimated_start_unix = estimated_start_unix;
        bid.estimated_finish_unix = estimated_finish_unix;
        bid.expiry_unix = bid_expiry_unix;
        bid.active = true;
        bid.bump = ctx.bumps.bid;

        emit!(BidSubmitted {
            job: bid.job,
            provider: bid.provider,
            price_lamports,
        });
        Ok(())
    }

    pub fn withdraw_bid(ctx: Context<ProviderBidSigner>) -> Result<()> {
        ctx.accounts.bid.active = false;
        Ok(())
    }

    pub fn assign_provider(ctx: Context<AssignProvider>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::Open, ClaError::InvalidJobState);
        let bid = &ctx.accounts.bid;
        require!(bid.active, ClaError::BidInactive);
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < bid.expiry_unix, ClaError::BidExpired);

        let assignment = &mut ctx.accounts.assignment;
        assignment.job = job.key();
        assignment.provider = bid.provider;
        assignment.price_lamports = bid.price_lamports;
        assignment.accept_deadline_unix = job.accept_by_unix;
        assignment.result_deadline_unix = job.result_by_unix;
        assignment.state = AssignmentState::Pending;
        assignment.bump = ctx.bumps.assignment;

        job.state = JobState::Assigned;
        job.assigned_provider = Some(bid.provider);

        emit!(ProviderAssigned {
            job: job.key(),
            provider: bid.provider,
            price_lamports: bid.price_lamports,
        });
        Ok(())
    }

    pub fn accept_assignment(ctx: Context<AcceptAssignment>) -> Result<()> {
        let assignment = &mut ctx.accounts.assignment;
        require!(
            assignment.state == AssignmentState::Pending,
            ClaError::InvalidAssignmentState
        );
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= assignment.accept_deadline_unix,
            ClaError::DeadlinePast
        );
        assignment.state = AssignmentState::Accepted;
        ctx.accounts.job.state = JobState::Running;
        emit!(AssignmentAccepted {
            job: ctx.accounts.job.key(),
            provider: assignment.provider,
        });
        Ok(())
    }

    // Result commitment

    pub fn commit_result(
        ctx: Context<CommitResult>,
        output_digests_hash: [u8; DIGEST_LEN],
        receipt_digest: [u8; DIGEST_LEN],
        commitment_hash: [u8; DIGEST_LEN],
        completed_at_unix: i64,
    ) -> Result<()> {
        let job_key = ctx.accounts.job.key();
        require!(
            ctx.accounts.job.state == JobState::Running,
            ClaError::InvalidJobState
        );
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= ctx.accounts.assignment.result_deadline_unix,
            ClaError::DeadlinePast
        );

        let result = &mut ctx.accounts.result_commit;
        result.job = job_key;
        result.assignment = ctx.accounts.assignment.key();
        result.provider = ctx.accounts.provider_wallet.key();
        result.output_digests_hash = output_digests_hash;
        result.receipt_digest = receipt_digest;
        result.commitment_hash = commitment_hash;
        result.completed_at_unix = completed_at_unix;
        result.reveal_deadline_unix = clock.unix_timestamp + 3600;
        result.revealed = false;
        result.bump = ctx.bumps.result_commit;

        ctx.accounts.job.state = JobState::Committed;
        emit!(ResultCommitted {
            job: job_key,
            commitment_hash,
        });
        Ok(())
    }

    pub fn reveal_result(
        ctx: Context<RevealResult>,
        output_artifact_uris: Vec<String>,
        nonce: [u8; NONCE_LEN],
    ) -> Result<()> {
        let result = &mut ctx.accounts.result_commit;
        require!(!result.revealed, ClaError::AlreadyRevealed);
        require!(
            output_artifact_uris.len() <= MAX_RESULT_URIS,
            ClaError::TooManyItems
        );
        let uri_bytes: usize = output_artifact_uris.iter().map(|uri| uri.len()).sum();
        require!(uri_bytes <= MAX_RESULT_URI_BYTES, ClaError::StringTooLong);
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= result.reveal_deadline_unix,
            ClaError::RevealExpired
        );

        // Verify nonce + uris hash matches commitment preimage.
        let mut hasher_input = Vec::with_capacity(NONCE_LEN + output_artifact_uris.len() * 64);
        hasher_input.extend_from_slice(&nonce);
        for uri in &output_artifact_uris {
            hasher_input.extend_from_slice(uri.as_bytes());
        }
        use anchor_lang::solana_program::hash::hash;
        let computed = hash(&hasher_input);
        require!(
            computed.to_bytes() == result.commitment_hash,
            ClaError::CommitmentMismatch
        );

        result.revealed = true;
        result.output_artifact_uris = output_artifact_uris;
        result.reveal_nonce = nonce;

        ctx.accounts.job.state = JobState::Reviewing;
        emit!(ResultRevealed {
            job: ctx.accounts.job.key(),
        });
        Ok(())
    }

    // Audit

    pub fn select_auditors(
        ctx: Context<SelectAuditors>,
        auditor_wallets: Vec<Pubkey>,
    ) -> Result<()> {
        let job = &ctx.accounts.job;
        require!(job.state == JobState::Reviewing, ClaError::InvalidJobState);
        require!(
            auditor_wallets.len() as u8 == job.auditor_quorum,
            ClaError::InvalidQuorum
        );
        // Emit selection event; individual Audit accounts are created separately
        emit!(AuditorsSelected {
            job: job.key(),
            auditors: auditor_wallets,
        });
        Ok(())
    }

    pub fn commit_audit(
        ctx: Context<CommitAudit>,
        score_commitment: [u8; DIGEST_LEN],
    ) -> Result<()> {
        let audit = &mut ctx.accounts.audit;
        require!(!audit.committed, ClaError::AlreadyCommitted);
        audit.auditor = ctx.accounts.auditor.key();
        audit.job = ctx.accounts.job.key();
        audit.score_commitment = score_commitment;
        audit.committed = true;
        audit.revealed = false;
        audit.committed_at = Clock::get()?.unix_timestamp;
        audit.bump = ctx.bumps.audit;
        Ok(())
    }

    pub fn reveal_audit(
        ctx: Context<RevealAudit>,
        score: u32,
        verdict: bool,
        nonce: [u8; NONCE_LEN],
    ) -> Result<()> {
        let audit = &mut ctx.accounts.audit;
        require!(
            audit.committed && !audit.revealed,
            ClaError::InvalidAuditState
        );

        // Verify score+verdict commitment
        let mut buf = Vec::with_capacity(NONCE_LEN + 5);
        buf.extend_from_slice(&nonce);
        buf.extend_from_slice(&score.to_le_bytes());
        buf.push(verdict as u8);
        use anchor_lang::solana_program::hash::hash;
        let computed = hash(&buf);
        require!(
            computed.to_bytes() == audit.score_commitment,
            ClaError::CommitmentMismatch
        );

        audit.score = score;
        audit.verdict = verdict;
        audit.revealed = true;
        audit.reveal_nonce = nonce;
        Ok(())
    }

    // Challenge

    pub fn open_challenge(
        ctx: Context<OpenChallenge>,
        evidence_digest: [u8; DIGEST_LEN],
        bond_lamports: u64,
    ) -> Result<()> {
        let job_key = ctx.accounts.job.key();
        require!(
            ctx.accounts.job.state == JobState::Reviewing,
            ClaError::InvalidJobState
        );
        let clock = Clock::get()?;
        let result = &ctx.accounts.result_commit;
        require!(
            clock.unix_timestamp
                <= result.completed_at_unix + ctx.accounts.job.challenge_window_seconds as i64,
            ClaError::ChallengeWindowClosed
        );

        // Lock challenge bond in escrow
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.challenger.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            bond_lamports,
        )?;

        let challenge = &mut ctx.accounts.challenge;
        challenge.job = job_key;
        challenge.challenger = ctx.accounts.challenger.key();
        challenge.evidence_digest = evidence_digest;
        challenge.bond_lamports = bond_lamports;
        challenge.resolved = false;
        challenge.succeeded = false;
        challenge.opened_at = clock.unix_timestamp;
        challenge.bump = ctx.bumps.challenge;

        ctx.accounts.job.state = JobState::Challenged;
        emit!(ChallengeOpened {
            job: job_key,
            challenger: challenge.challenger,
        });
        Ok(())
    }

    pub fn resolve_challenge(
        ctx: Context<ResolveChallenge>,
        challenge_succeeded: bool,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        require!(!challenge.resolved, ClaError::AlreadyResolved);
        challenge.resolved = true;
        challenge.succeeded = challenge_succeeded;

        let job = &mut ctx.accounts.job;
        job.state = if challenge_succeeded {
            JobState::Rejected
        } else {
            JobState::Reviewing
        };
        emit!(ChallengeResolved {
            job: job.key(),
            succeeded: challenge_succeeded,
        });
        Ok(())
    }

    // Settlement

    pub fn settle_job(ctx: Context<SettleJob>) -> Result<()> {
        let job = &ctx.accounts.job;
        require!(
            job.state == JobState::Reviewing || job.state == JobState::Rejected,
            ClaError::InvalidJobState
        );

        // Determine accepted/rejected from audit reveals
        let accepted = job.state != JobState::Rejected;

        // Transfer from escrow to provider if accepted
        // (simplified: full budget released; royalties handled by treasury CPI)
        if accepted {
            let job_key = job.key();
            let seeds = &[b"escrow", job_key.as_ref(), &[ctx.bumps.escrow]];
            let signer_seeds = &[&seeds[..]];

            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.escrow.to_account_info(),
                        to: ctx.accounts.provider_wallet.to_account_info(),
                    },
                    signer_seeds,
                ),
                job.provider_budget,
            )?;
        }

        let job_key = job.key();
        let provider_budget = job.provider_budget;
        ctx.accounts.job.state = JobState::Settled;
        emit!(JobSettled {
            job: job_key,
            accepted,
            provider_paid: if accepted { provider_budget } else { 0 },
        });

        // Emit reputation event
        emit!(ReputationRecorded {
            subject: ctx.accounts.assignment.provider,
            event_type: if accepted {
                RepEventType::JobAccepted
            } else {
                RepEventType::JobRejected
            },
            job: job_key,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn withdraw_refund(ctx: Context<WithdrawRefund>) -> Result<()> {
        let job = &ctx.accounts.job;
        require!(
            job.state == JobState::Cancelled
                || job.state == JobState::Expired
                || job.state == JobState::Rejected,
            ClaError::InvalidJobState
        );

        let job_key = job.key();
        let seeds = &[b"escrow", job_key.as_ref(), &[ctx.bumps.escrow]];
        let signer_seeds = &[&seeds[..]];
        let escrow_balance = ctx.accounts.escrow.lamports();

        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
                signer_seeds,
            ),
            escrow_balance,
        )?;
        emit!(RefundWithdrawn {
            job: job.key(),
            amount: escrow_balance,
        });
        Ok(())
    }

    // Reputation

    pub fn record_reputation_event(
        ctx: Context<RecordReputation>,
        subject: Pubkey,
        event_nonce: u64,
        event_type: RepEventType,
        evidence_digest: Option<[u8; DIGEST_LEN]>,
    ) -> Result<()> {
        let ev = &mut ctx.accounts.reputation_event;
        ev.subject = subject;
        ev.event_nonce = event_nonce;
        ev.event_type = event_type;
        ev.evidence_digest = evidence_digest;
        ev.recorded_at = Clock::get()?.unix_timestamp;
        ev.bump = ctx.bumps.reputation_event;
        Ok(())
    }
}

// State accounts

#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub upgrade_authority: Pubkey,
    pub emergency_pause_authority: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
    pub bump: u8,
}

#[account]
pub struct Provider {
    pub wallet: Pubkey,
    pub display_name: String, // max 64
    pub endpoint_url: String, // max 128
    pub active: bool,
    pub jobs_completed: u64,
    pub jobs_failed: u64,
    pub reputation_score: u32, // 0-1000 scale
    pub bump: u8,
}

#[account]
pub struct Capability {
    pub provider: Pubkey,
    pub cap_digest: [u8; DIGEST_LEN],
    pub gpu_count: u8,
    pub gpu_memory_gib: u16,
    pub cpu_cores: u16,
    pub memory_gib: u16,
    pub disk_gib: u32,
    pub supported_kinds: Vec<u8>, // JobKind discriminants
    pub regions: Vec<String>,
    pub active: bool,
    pub bump: u8,
}

#[account]
pub struct Job {
    pub creator: Pubkey,
    pub nonce: u64,
    pub manifest_digest: [u8; DIGEST_LEN],
    pub kind: JobKind,
    pub state: JobState,
    pub provider_budget: u64,
    pub auditor_budget: u64,
    pub royalty_budget: u64,
    pub bid_end_unix: i64,
    pub accept_by_unix: i64,
    pub result_by_unix: i64,
    pub auditor_quorum: u8,
    pub challenge_window_seconds: u32,
    pub assurance_profile: u8,
    pub assigned_provider: Option<Pubkey>,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
pub struct Bid {
    pub job: Pubkey,
    pub provider: Pubkey,
    pub price_lamports: u64,
    pub estimated_start_unix: i64,
    pub estimated_finish_unix: i64,
    pub expiry_unix: i64,
    pub active: bool,
    pub bump: u8,
}

#[account]
pub struct Assignment {
    pub job: Pubkey,
    pub provider: Pubkey,
    pub price_lamports: u64,
    pub accept_deadline_unix: i64,
    pub result_deadline_unix: i64,
    pub state: AssignmentState,
    pub bump: u8,
}

#[account]
pub struct ResultCommit {
    pub job: Pubkey,
    pub assignment: Pubkey,
    pub provider: Pubkey,
    pub output_digests_hash: [u8; DIGEST_LEN],
    pub receipt_digest: [u8; DIGEST_LEN],
    pub commitment_hash: [u8; DIGEST_LEN],
    pub completed_at_unix: i64,
    pub reveal_deadline_unix: i64,
    pub revealed: bool,
    pub output_artifact_uris: Vec<String>,
    pub reveal_nonce: [u8; NONCE_LEN],
    pub bump: u8,
}

#[account]
pub struct Audit {
    pub job: Pubkey,
    pub auditor: Pubkey,
    pub score_commitment: [u8; DIGEST_LEN],
    pub committed: bool,
    pub revealed: bool,
    pub score: u32,
    pub verdict: bool,
    pub reveal_nonce: [u8; NONCE_LEN],
    pub committed_at: i64,
    pub bump: u8,
}

#[account]
pub struct Challenge {
    pub job: Pubkey,
    pub challenger: Pubkey,
    pub evidence_digest: [u8; DIGEST_LEN],
    pub bond_lamports: u64,
    pub resolved: bool,
    pub succeeded: bool,
    pub opened_at: i64,
    pub bump: u8,
}

#[account]
pub struct ReputationEvent {
    pub subject: Pubkey,
    pub event_nonce: u64,
    pub event_type: RepEventType,
    pub evidence_digest: Option<[u8; DIGEST_LEN]>,
    pub recorded_at: i64,
    pub bump: u8,
}

// Enums

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default)]
pub enum JobState {
    #[default]
    Draft,
    Open,
    Assigned,
    Running,
    Committed,
    Reviewing,
    Challenged,
    Accepted,
    Rejected,
    Settled,
    Expired,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AssignmentState {
    Pending,
    Accepted,
    Declined,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum JobKind {
    BatchCompute,
    ModelAdaptation,
    ModelEvaluation,
    InteractiveInference,
    FederatedLearning,
    PersistentService,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RepEventType {
    JobAccepted,
    JobRejected,
    CompletedOnTime,
    LateDelivery,
    NoShow,
    InvalidReveal,
    SuccessfulChallenge,
    FailedChallenge,
    LateAudit,
    VerifiedCapabilityUpdate,
}

// Contexts

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 2 + 1 + 1,
        seeds = [b"clawd".as_ref(), b"config".as_ref()],
        bump
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    #[account(
        mut,
        seeds = [b"clawd".as_ref(), b"config".as_ref()],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SelectAuditors<'info> {
    #[account(
        seeds = [b"clawd".as_ref(), b"config".as_ref()],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct ResolveChallenge<'info> {
    #[account(
        seeds = [b"clawd".as_ref(), b"config".as_ref()],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [b"challenge", job.key().as_ref(), challenge.challenger.as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,
}

#[derive(Accounts)]
pub struct PauseOnly<'info> {
    #[account(
        mut,
        seeds = [b"clawd".as_ref(), b"config".as_ref()],
        bump = config.bump,
        has_one = emergency_pause_authority
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub emergency_pause_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(seeds = [b"clawd".as_ref(), b"config".as_ref()], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = wallet,
        space = 8 + 32 + 4 + 64 + 4 + 128 + 1 + 8 + 8 + 4 + 1,
        seeds = [b"provider", wallet.key().as_ref()],
        bump
    )]
    pub provider: Account<'info, Provider>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProviderSigner<'info> {
    #[account(
        mut,
        seeds = [b"provider", wallet.key().as_ref()],
        bump = provider.bump,
        has_one = wallet
    )]
    pub provider: Account<'info, Provider>,
    pub wallet: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(cap_digest: [u8; 32])]
pub struct PublishCapability<'info> {
    #[account(seeds = [b"clawd".as_ref(), b"config".as_ref()], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(seeds = [b"provider", wallet.key().as_ref()], bump = provider.bump, has_one = wallet)]
    pub provider: Account<'info, Provider>,
    #[account(
        init,
        payer = wallet,
        space = 8 + 32 + 32 + 1 + 2 + 2 + 2 + 4 + 4 + 64 + 4 + 256 + 1 + 1,
        seeds = [b"capability", provider.key().as_ref(), &cap_digest],
        bump
    )]
    pub capability: Account<'info, Capability>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProviderCapabilitySigner<'info> {
    #[account(seeds = [b"provider", wallet.key().as_ref()], bump = provider.bump, has_one = wallet)]
    pub provider: Account<'info, Provider>,
    #[account(mut, seeds = [b"capability", provider.key().as_ref(), &capability.cap_digest], bump = capability.bump)]
    pub capability: Account<'info, Capability>,
    pub wallet: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateJob<'info> {
    #[account(seeds = [b"clawd".as_ref(), b"config".as_ref()], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 8 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 4 + 1 + 33 + 8 + 1,
        seeds = [b"job", creator.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub job: Account<'info, Job>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundJob<'info> {
    #[account(
        mut,
        seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()],
        bump = job.bump,
        has_one = creator
    )]
    pub job: Account<'info, Job>,
    /// CHECK: escrow PDA receives funds
    #[account(
        mut,
        seeds = [b"escrow", job.key().as_ref()],
        bump
    )]
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JobCreatorOnly<'info> {
    #[account(
        mut,
        seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()],
        bump = job.bump,
        has_one = creator
    )]
    pub job: Account<'info, Job>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExpireJob<'info> {
    #[account(
        mut,
        seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct SubmitBid<'info> {
    #[account(seeds = [b"clawd".as_ref(), b"config".as_ref()], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    #[account(seeds = [b"provider", provider_wallet.key().as_ref()], bump = provider.bump)]
    pub provider: Account<'info, Provider>,
    #[account(
        init,
        payer = provider_wallet,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"bid", job.key().as_ref(), provider_wallet.key().as_ref()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    #[account(mut)]
    pub provider_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProviderBidSigner<'info> {
    #[account(
        mut,
        seeds = [b"bid", bid.job.as_ref(), provider_wallet.key().as_ref()],
        bump = bid.bump,
        constraint = bid.provider == provider_wallet.key() @ ClaError::Unauthorized
    )]
    pub bid: Account<'info, Bid>,
    pub provider_wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct AssignProvider<'info> {
    #[account(
        mut,
        seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()],
        bump = job.bump,
        has_one = creator
    )]
    pub job: Account<'info, Job>,
    #[account(seeds = [b"bid", job.key().as_ref(), bid.provider.as_ref()], bump = bid.bump)]
    pub bid: Account<'info, Bid>,
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"assignment", job.key().as_ref(), bid.provider.as_ref()],
        bump
    )]
    pub assignment: Account<'info, Assignment>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptAssignment<'info> {
    #[account(mut, seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [b"assignment", job.key().as_ref(), provider_wallet.key().as_ref()],
        bump = assignment.bump,
        constraint = assignment.provider == provider_wallet.key() @ ClaError::Unauthorized
    )]
    pub assignment: Account<'info, Assignment>,
    pub provider_wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct CommitResult<'info> {
    #[account(mut, seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    #[account(seeds = [b"assignment", job.key().as_ref(), provider_wallet.key().as_ref()], bump = assignment.bump)]
    pub assignment: Account<'info, Assignment>,
    #[account(
        init,
        payer = provider_wallet,
        space = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 4 + 512 + 32 + 1,
        seeds = [b"result", assignment.key().as_ref()],
        bump
    )]
    pub result_commit: Account<'info, ResultCommit>,
    #[account(mut)]
    pub provider_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealResult<'info> {
    #[account(mut, seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [b"result", result_commit.assignment.as_ref()],
        bump = result_commit.bump,
        constraint = result_commit.provider == provider.key() @ ClaError::Unauthorized
    )]
    pub result_commit: Account<'info, ResultCommit>,
    pub provider: Signer<'info>,
}

#[derive(Accounts)]
pub struct CommitAudit<'info> {
    #[account(seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    #[account(
        init,
        payer = auditor,
        space = 8 + 32 + 32 + 32 + 1 + 1 + 4 + 1 + 32 + 8 + 1,
        seeds = [b"audit", job.key().as_ref(), auditor.key().as_ref()],
        bump
    )]
    pub audit: Account<'info, Audit>,
    #[account(mut)]
    pub auditor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealAudit<'info> {
    #[account(
        mut,
        seeds = [b"audit", audit.job.as_ref(), auditor.key().as_ref()],
        bump = audit.bump,
        has_one = auditor
    )]
    pub audit: Account<'info, Audit>,
    pub auditor: Signer<'info>,
}

#[derive(Accounts)]
pub struct OpenChallenge<'info> {
    #[account(mut, seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    #[account(seeds = [b"result", result_commit.assignment.as_ref()], bump = result_commit.bump)]
    pub result_commit: Account<'info, ResultCommit>,
    #[account(
        init,
        payer = challenger,
        space = 8 + 32 + 32 + 32 + 8 + 1 + 1 + 8 + 1,
        seeds = [b"challenge", job.key().as_ref(), challenger.key().as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    /// CHECK: escrow receives bond
    #[account(mut, seeds = [b"escrow", job.key().as_ref()], bump)]
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleJob<'info> {
    #[account(mut, seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    #[account(seeds = [b"assignment", job.key().as_ref(), assignment.provider.as_ref()], bump = assignment.bump)]
    pub assignment: Account<'info, Assignment>,
    /// CHECK: escrow pays out
    #[account(mut, seeds = [b"escrow", job.key().as_ref()], bump)]
    pub escrow: SystemAccount<'info>,
    #[account(mut, address = assignment.provider @ ClaError::Unauthorized)]
    pub provider_wallet: SystemAccount<'info>,
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawRefund<'info> {
    #[account(seeds = [b"job", job.creator.as_ref(), &job.nonce.to_le_bytes()], bump = job.bump)]
    pub job: Account<'info, Job>,
    /// CHECK: escrow returns funds
    #[account(mut, seeds = [b"escrow", job.key().as_ref()], bump)]
    pub escrow: SystemAccount<'info>,
    #[account(mut, address = job.creator @ ClaError::Unauthorized)]
    pub creator: SystemAccount<'info>,
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(subject: Pubkey, event_nonce: u64)]
pub struct RecordReputation<'info> {
    #[account(seeds = [b"clawd".as_ref(), b"config".as_ref()], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 1 + 33 + 8 + 1,
        seeds = [b"reputation", subject.as_ref(), &event_nonce.to_le_bytes()],
        bump
    )]
    pub reputation_event: Account<'info, ReputationEvent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Events

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub fee_bps: u16,
}
#[event]
pub struct ProtocolPaused {}
#[event]
pub struct ProtocolResumed {}
#[event]
pub struct ProviderRegistered {
    pub wallet: Pubkey,
}
#[event]
pub struct CapabilityPublished {
    pub provider: Pubkey,
    pub cap_digest: [u8; 32],
}
#[event]
pub struct JobCreated {
    pub job: Pubkey,
    pub creator: Pubkey,
    pub kind: JobKind,
    pub manifest_digest: [u8; 32],
}
#[event]
pub struct JobFunded {
    pub job: Pubkey,
    pub total_lamports: u64,
}
#[event]
pub struct JobCancelled {
    pub job: Pubkey,
}
#[event]
pub struct JobExpired {
    pub job: Pubkey,
}
#[event]
pub struct BidSubmitted {
    pub job: Pubkey,
    pub provider: Pubkey,
    pub price_lamports: u64,
}
#[event]
pub struct ProviderAssigned {
    pub job: Pubkey,
    pub provider: Pubkey,
    pub price_lamports: u64,
}
#[event]
pub struct AssignmentAccepted {
    pub job: Pubkey,
    pub provider: Pubkey,
}
#[event]
pub struct ResultCommitted {
    pub job: Pubkey,
    pub commitment_hash: [u8; 32],
}
#[event]
pub struct ResultRevealed {
    pub job: Pubkey,
}
#[event]
pub struct AuditorsSelected {
    pub job: Pubkey,
    pub auditors: Vec<Pubkey>,
}
#[event]
pub struct ChallengeOpened {
    pub job: Pubkey,
    pub challenger: Pubkey,
}
#[event]
pub struct ChallengeResolved {
    pub job: Pubkey,
    pub succeeded: bool,
}
#[event]
pub struct JobSettled {
    pub job: Pubkey,
    pub accepted: bool,
    pub provider_paid: u64,
}
#[event]
pub struct RefundWithdrawn {
    pub job: Pubkey,
    pub amount: u64,
}
#[event]
pub struct ReputationRecorded {
    pub subject: Pubkey,
    pub event_type: RepEventType,
    pub job: Pubkey,
    pub timestamp: i64,
}

// Errors

#[error_code]
pub enum ClaError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Fee exceeds protocol maximum")]
    FeeTooHigh,
    #[msg("String exceeds maximum length")]
    StringTooLong,
    #[msg("Invalid auditor quorum")]
    InvalidQuorum,
    #[msg("Invalid assurance profile")]
    InvalidProfile,
    #[msg("Deadline is in the past")]
    DeadlinePast,
    #[msg("Deadline has not passed yet")]
    DeadlineNotPast,
    #[msg("Deadlines must be in ascending order")]
    DeadlineOrder,
    #[msg("Invalid job state for this instruction")]
    InvalidJobState,
    #[msg("Invalid assignment state")]
    InvalidAssignmentState,
    #[msg("Bidding period is closed")]
    BiddingClosed,
    #[msg("Bid exceeds provider budget")]
    BidTooHigh,
    #[msg("Estimated finish exceeds result deadline")]
    DeadlineMismatch,
    #[msg("Bid is no longer active")]
    BidInactive,
    #[msg("Bid has expired")]
    BidExpired,
    #[msg("Result has already been revealed")]
    AlreadyRevealed,
    #[msg("Reveal window has expired")]
    RevealExpired,
    #[msg("Commitment hash does not match revealed data")]
    CommitmentMismatch,
    #[msg("Audit already committed")]
    AlreadyCommitted,
    #[msg("Invalid audit state")]
    InvalidAuditState,
    #[msg("Challenge window has closed")]
    ChallengeWindowClosed,
    #[msg("Challenge already resolved")]
    AlreadyResolved,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized signer or account")]
    Unauthorized,
    #[msg("Provider is inactive")]
    ProviderInactive,
    #[msg("Too many items supplied")]
    TooManyItems,
}

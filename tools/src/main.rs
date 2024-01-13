#![feature(string_remove_matches)]
#![feature(debug_closure_helpers)]

use std::{
    fmt::{Debug, Display, Formatter},
    fs::File,
    io,
    io::{stdout, BufWriter, Write},
    path::PathBuf,
    slice,
};

use clap::{ArgAction, Args, Parser, Subcommand, ValueHint};
use clap_num::si_number;
use clap_verbosity_flag::{LevelFilter, Verbosity};
use clap_verbosity_flag2 as clap_verbosity_flag;
use error_stack::ResultExt;
use memmap2::Mmap;
use rand::{
    distributions::{Distribution, Uniform},
    SeedableRng,
};
use rand_distr::LogNormal;
use rand_xoshiro::Xoshiro256PlusPlus;

#[derive(Parser, Debug)]
#[command(version, author = "Alex Saveau (@SUPERCILEX)")]
#[command(infer_subcommands = true, infer_long_args = true)]
#[command(disable_help_flag = true)]
#[command(max_term_width = 100)]
#[cfg_attr(test, command(help_expected = true))]
struct Tools {
    #[clap(subcommand)]
    cmd: Cmd,

    #[command(flatten)]
    #[command(next_display_order = None)]
    verbose: Verbosity<clap_verbosity_flag::InfoLevel>,

    #[arg(short, long, short_alias = '?', global = true)]
    #[arg(action = ArgAction::Help, help = "Print help (use `--help` for more detail)")]
    #[arg(long_help = "Print help (use `-h` for a summary)")]
    help: Option<bool>,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    Generate(Generate),
    Dump(Dump),
}

#[derive(Args, Debug)]
struct Generate {
    #[clap(short = 'n', long = "entries", alias = "num-entries")]
    #[clap(value_parser = num_entries_parser)]
    #[clap(default_value = "10000")]
    num_entries: usize,
}

#[derive(Args, Debug)]
struct Dump {
    #[clap(value_hint = ValueHint::FilePath)]
    database: Option<PathBuf>,
}

fn main() -> error_stack::Result<(), io::Error> {
    let args = Tools::parse();

    match args.cmd {
        Cmd::Generate(Generate { num_entries }) => gen_entries(num_entries),
        Cmd::Dump(Dump { database }) => dump(
            database,
            args.verbose.log_level_filter() > LevelFilter::Info,
        ),
    }
}

fn num_entries_parser(s: &str) -> Result<usize, String> {
    let files = lenient_si_number(s)?;
    if files > 0 {
        Ok(files)
    } else {
        Err(String::from("At least one entry must be generated."))
    }
}

fn lenient_si_number(s: &str) -> Result<usize, String> {
    let mut s = s.replace('K', "k");
    s.remove_matches(",");
    s.remove_matches("_");
    si_number(&s)
}

fn gen_entries(n: usize) -> error_stack::Result<(), io::Error> {
    let mut file = dirs::cache_dir()
        .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))
        .attach_printable("Failed to retrieve home dir")?;
    file.push("clipboard-history@alexsaveau.dev/database.log");
    let file = File::create(file).attach_printable("Failed to open log file")?;
    let mut file = BufWriter::new(file);

    let mut rng = Xoshiro256PlusPlus::seed_from_u64(n as u64);
    let distr = LogNormal::from_mean_cv(500f64, 10f64).unwrap();
    let valid_byte_range = Uniform::from(0x21u8..=0x7E);

    let mut total = 0;
    for _ in 0..n {
        let bytes = distr.sample(&mut rng).round().max(1.) as usize;
        total += bytes;

        file.write_all(slice::from_ref(&1))
            .attach_printable("Failed to write to log file")?;
        for b in valid_byte_range.sample_iter(&mut rng).take(bytes) {
            file.write_all(slice::from_ref(&b))
                .attach_printable("Failed to write to log file")?;
        }
        file.write_all(slice::from_ref(&0))
            .attach_printable("Failed to write to log file")?;
    }

    file.flush()
        .attach_printable("Failed to write to log file")?;
    println!("Wrote {total} bytes.");

    Ok(())
}

#[derive(Default, Debug)]
struct OpCountStats {
    num_save_texts: usize,
    num_deletes: usize,
    num_favorites: usize,
    num_unfavorites: usize,
    num_moves: usize,
}

#[derive(Default, Debug)]
struct RawStats {
    num_entries: usize,
    total_str_bytes: usize,
    ops: OpCountStats,
}

#[derive(Default)]
struct Stats {
    raw: RawStats,
    lengths: Vec<usize>,
}

impl Display for Stats {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut s = f.debug_struct("Stats");

        s.field("raw", &self.raw);
        if self.lengths.is_empty() {
            s.field("computed", &"unavailable");
        } else {
            let mut min_value = usize::MAX;
            let mut max_value = 0;

            for &len in &self.lengths {
                if len < min_value {
                    min_value = len;
                }
                if len > max_value {
                    max_value = len;
                }
            }

            s.field_with("computed", |f| {
                f.debug_struct("ComputedStats")
                    .field("min_entry_length", &min_value)
                    .field("max_entry_length", &max_value)
                    .field(
                        "mean_entry_length",
                        #[allow(clippy::cast_precision_loss)]
                        &((self.raw.total_str_bytes as f64) / (self.lengths.len() as f64)),
                    )
                    .field("median_entry_length", &self.lengths[self.lengths.len() / 2])
                    .finish()
            });
        }

        s.finish()
    }
}

fn dump(database: Option<PathBuf>, verbose: bool) -> error_stack::Result<(), io::Error> {
    let mut stats = Stats::default();

    {
        let database = database
            .or_else(|| {
                dirs::cache_dir().map(|mut f| {
                    f.push("clipboard-history@alexsaveau.dev/database.log");
                    f
                })
            })
            .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))
            .attach_printable("Failed to find database file")?;

        let file = File::open(&database)
            .attach_printable_lazy(|| format!("Failed to open file {database:?}"))?;
        let bytes = unsafe { Mmap::map(&file) }.attach_printable("Failed to mmap file")?;

        read(&bytes, &mut stats, verbose)?;
    }

    if verbose {
        println!("-------------------------------------------\n")
    }
    println!("Stats: {stats:#}");

    Ok(())
}

fn read(
    bytes: &Mmap,
    Stats {
        raw:
            RawStats {
                num_entries,
                total_str_bytes,
                ops:
                    OpCountStats {
                        num_save_texts: num_save_text_ops,
                        num_deletes: num_delete_ops,
                        num_favorites: num_favorite_ops,
                        num_unfavorites: num_unfavorite_ops,
                        num_moves: num_move_ops,
                    },
            },
        lengths,
    }: &mut Stats,
    verbose: bool,
) -> error_stack::Result<(), io::Error> {
    const OP_TYPE_SAVE_TEXT: u8 = 1;
    const OP_TYPE_DELETE_TEXT: u8 = 2;
    const OP_TYPE_FAVORITE_ITEM: u8 = 3;
    const OP_TYPE_UNFAVORITE_ITEM: u8 = 4;
    const OP_TYPE_MOVE_ITEM_TO_END: u8 = 5;

    let mut stdout = stdout().lock();
    let mut save_count = 1;
    let mut i = 0;
    while i < bytes.len() {
        let op = bytes[i];
        i += 1;
        match op {
            OP_TYPE_SAVE_TEXT => {
                let raw_len = memchr::memchr(0, &bytes[i..])
                    .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidData))
                    .attach_printable("Data was not NUL terminated")?;

                {
                    let length = 1 + raw_len;
                    if verbose {
                        writeln!(
                            stdout,
                            "SAVE_TEXT@{i}\nLength: {length}\nId: {save_count}\n"
                        )?;
                    }
                    i += length;
                    save_count += 1;
                }

                *total_str_bytes += raw_len;
                lengths.push(raw_len);
            }
            OP_TYPE_DELETE_TEXT => {
                if verbose {
                    writeln!(
                        stdout,
                        "DELETE_TEXT@{i}\nId: {}\n",
                        u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                    )?;
                }
                i += 4;

                *num_delete_ops += 1;
            }
            OP_TYPE_FAVORITE_ITEM => {
                if verbose {
                    writeln!(
                        stdout,
                        "FAVORITE_ITEM@{i}\nId: {}\n",
                        u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                    )?;
                }
                i += 4;

                *num_favorite_ops += 1;
            }
            OP_TYPE_UNFAVORITE_ITEM => {
                if verbose {
                    writeln!(
                        stdout,
                        "UNFAVORITE_ITEM@{i}\nId: {}\n",
                        u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                    )?;
                }
                i += 4;

                *num_unfavorite_ops += 1;
            }
            OP_TYPE_MOVE_ITEM_TO_END => {
                if verbose {
                    writeln!(
                        stdout,
                        "MOVE_ITEM_TO_END@{i}\nId: {}\n",
                        u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                    )?;
                }
                i += 4;

                *num_move_ops += 1;
            }
            _ => {
                return Err(io::Error::from(io::ErrorKind::InvalidData))
                    .attach_printable_lazy(|| format!("Invalid op: {}", bytes[i]));
            }
        }
    }

    *num_save_text_ops = save_count - 1;
    *num_entries = *num_save_text_ops - *num_delete_ops;

    Ok(())
}
